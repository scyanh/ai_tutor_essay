"""Alta, indexación y baja de las lecturas (PDF) que los maestros adjuntan a sus tareas.

También se puede usar desde la terminal para cargar PDFs a una tarea:
    uv run python -m services.documents --assignment 1 ../resources/segunda-guerra-mundial/*.pdf
"""
import io
import logging
import os
import re
import secrets
import unicodedata
from datetime import datetime

from sqlalchemy.orm import Session

from db.models import Assignment, AssignmentDocument
from .search_service import SearchService
from .storage_service import StorageService

logger = logging.getLogger(__name__)

MAX_PDF_BYTES = 20 * 1024 * 1024
# Texto completo que se guarda para la búsqueda de respaldo en PostgreSQL
MAX_STORED_TEXT = 60_000

storage = StorageService()
search = SearchService()


class DocumentError(ValueError):
    pass


def safe_file_name(name: str) -> str:
    base = unicodedata.normalize("NFKD", os.path.basename(name)).encode("ascii", "ignore").decode()
    stem, _, ext = base.rpartition(".")
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem or base).strip("_")[:120] or "documento"
    return f"{stem}.{ext.lower()}" if ext else f"{stem}.pdf"


def extract_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    return "\n\n".join(p for p in pages if p)


def summarize(text: str, file_name: str) -> str:
    """Resumen breve para el maestro, el alumno y el agente; si Gemini falla, el inicio del texto."""
    fallback = re.sub(r"\s+", " ", text).strip()[:280]
    if not text.strip():
        return ""
    try:
        from google import genai

        client = genai.Client()
        response = client.models.generate_content(
            model=os.getenv("MODEL_NAME", "gemini-3.8-flash"),
            contents=(
                "Resume en máximo dos frases, en español y sin encabezados, de qué trata esta lectura "
                f"para estudiantes de preparatoria. Archivo: {file_name}\n\n{text[:12000]}"
            ),
        )
        return (response.text or "").strip()[:600] or fallback
    except Exception:
        logger.exception("No se pudo resumir %s con Gemini", file_name)
        return fallback


def add_document(db: Session, assignment: Assignment, file_name: str, data: bytes) -> AssignmentDocument:
    """Guarda el PDF en Cloud Storage, lo registra y lo indexa. Si ya existe uno con el mismo nombre en la tarea, lo reemplaza."""
    if len(data) > MAX_PDF_BYTES:
        raise DocumentError(f"«{file_name}» pesa más de {MAX_PDF_BYTES // (1024 * 1024)} MB.")
    if not data.startswith(b"%PDF"):
        raise DocumentError(f"«{file_name}» no es un PDF válido.")

    name = safe_file_name(file_name)
    try:
        text = extract_text(data)
    except Exception as exc:
        raise DocumentError(f"No se pudo leer «{file_name}»: el PDF parece dañado o protegido.") from exc

    gcs_uri = storage.upload_document(assignment.id, name, data)

    doc = db.query(AssignmentDocument).filter_by(assignment_id=assignment.id, file_name=name).first()
    if doc is None:
        doc = AssignmentDocument(id=f"doc_{secrets.token_hex(6)}", assignment_id=assignment.id, file_name=name)
        db.add(doc)
    doc.gcs_uri = gcs_uri
    doc.file_type = "application/pdf"
    doc.size_bytes = len(data)
    doc.content_snippet = text[:MAX_STORED_TEXT]
    doc.summary = summarize(text, name)
    doc.uploaded_at = datetime.utcnow()
    doc.index_status = "local"
    db.flush()

    if search.enabled:
        try:
            search.index_document(doc)
            doc.index_status = "indexing"
        except Exception:
            logger.exception("No se pudo indexar %s en Vertex AI Search", name)
            doc.index_status = "error"
    return doc


def refresh_index_status(doc: AssignmentDocument) -> None:
    if doc.index_status == "indexing" and search.enabled:
        try:
            doc.index_status = search.index_state(doc)
        except Exception:
            logger.exception("No se pudo consultar el estado de %s", doc.file_name)


def delete_document(db: Session, doc: AssignmentDocument) -> None:
    if search.enabled and doc.index_status != "local":
        search.delete_document(doc)
    if storage.owns(doc.gcs_uri):
        storage.delete(doc.gcs_uri)
    db.delete(doc)


def _main() -> None:
    import argparse

    from db.database import get_db

    parser = argparse.ArgumentParser()
    parser.add_argument("--assignment", type=int, required=True)
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()

    with get_db() as db:
        assignment = db.get(Assignment, args.assignment)
        if assignment is None:
            raise SystemExit(f"No existe la tarea {args.assignment}.")
        for path in args.files:
            with open(path, "rb") as fh:
                doc = add_document(db, assignment, os.path.basename(path), fh.read())
            db.commit()
            print(f"{doc.file_name}: {doc.index_status} · {len(doc.content_snippet or '')} caracteres · {doc.summary[:90]}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    _main()
