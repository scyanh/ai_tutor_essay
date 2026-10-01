"""Herramientas de ADK para interacción con PostgreSQL, Cloud Storage y Vertex AI Search."""
from datetime import datetime
from typing import Dict, Any, List, Optional, Union
from db.database import get_db
from db.models import Assignment, AssignmentDocument, StudentEssay
from services.search_service import SearchService

search_service = SearchService()


def _get_assignment(db, identifier: Union[int, str]) -> Optional[Assignment]:
    """Busca una tarea por su id numérico (PostgreSQL) o por su slug textual."""
    if isinstance(identifier, int):
        return db.query(Assignment).filter_by(id=identifier).first()
    if isinstance(identifier, str):
        if identifier.isdigit():
            by_id = db.query(Assignment).filter_by(id=int(identifier)).first()
            if by_id:
                return by_id
        return db.query(Assignment).filter_by(slug=identifier).first()
    return None


def get_assignment_details(assignment_id: Union[int, str]) -> Dict[str, Any]:
    """Obtiene los detalles completos de una tarea de ensayo dejada por el profesor.

    Args:
        assignment_id: ID entero de PostgreSQL o slug de la tarea (ej. 1 o 'segunda-guerra-mundial').

    Returns:
        Un diccionario con el ID, slug, título, descripción, rúbrica, fecha límite y lista de documentos adjuntos.
    """
    with get_db() as db:
        assignment = _get_assignment(db, assignment_id)
        if not assignment:
            return {
                "status": "error",
                "message": f"No se encontró la tarea con ID o slug '{assignment_id}'.",
            }

        docs_info = []
        for doc in assignment.documents:
            docs_info.append({
                "file_name": doc.file_name,
                "gcs_uri": doc.gcs_uri,
                "summary": doc.summary,
            })

        return {
            "status": "success",
            "assignment_id": assignment.id,
            "slug": assignment.slug,
            "title": assignment.title,
            "description": assignment.description,
            "rubric": assignment.rubric,
            "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
            "documents": docs_info,
        }


def get_student_draft(student_id: int, assignment_id: Union[int, str]) -> Dict[str, Any]:
    """Recupera el borrador actual del ensayo y el esquema guardado por un estudiante.

    Args:
        student_id: El identificador del estudiante (ej. 12).
        assignment_id: ID entero de PostgreSQL o slug de la tarea (ej. 1 o 'segunda-guerra-mundial').

    Returns:
        Un diccionario con el título del ensayo, contenido actual, esquema, estado y última fecha de guardado.
    """
    with get_db() as db:
        assignment = _get_assignment(db, assignment_id)
        if not assignment:
            return {
                "status": "error",
                "message": f"No se encontró la tarea con ID o slug '{assignment_id}'.",
            }

        draft = (
            db.query(StudentEssay)
            .filter_by(student_id=student_id, assignment_id=assignment.id)
            .first()
        )
        if not draft:
            return {
                "status": "not_found",
                "message": f"El estudiante '{student_id}' aún no tiene un borrador para la tarea '{assignment_id}'.",
                "title": "",
                "content": "",
                "outline": "",
                "status_essay": "not_started",
            }

        return {
            "status": "success",
            "assignment_id": assignment.id,
            "title": draft.title or "Sin título",
            "content": draft.content or "",
            "outline": draft.outline or "",
            "status_essay": draft.status,
            "last_saved_at": draft.last_saved_at.isoformat() if draft.last_saved_at else None,
            "submitted_at": draft.submitted_at.isoformat() if draft.submitted_at else None,
        }


def save_student_draft(
    student_id: int,
    assignment_id: Union[int, str],
    title: str,
    content: str,
    outline: str,
) -> Dict[str, Any]:
    """Guarda el progreso del ensayo (título, contenido y esquema) en la base de datos PostgreSQL.

    Args:
        student_id: Identificador del estudiante (ej. 12).
        assignment_id: ID entero de PostgreSQL o slug de la tarea (ej. 1 o 'segunda-guerra-mundial').
        title: Título del ensayo redactado por el estudiante.
        content: Texto o párrafos del ensayo redactados hasta el momento.
        outline: Esquema de argumentos o notas de la tesis del estudiante.

    Returns:
        Un diccionario con el estado de confirmación del guardado y la fecha/hora registrada.
    """
    with get_db() as db:
        assignment = _get_assignment(db, assignment_id)
        if not assignment:
            return {
                "status": "error",
                "message": f"No se encontró la tarea con ID o slug '{assignment_id}'.",
            }

        draft = (
            db.query(StudentEssay)
            .filter_by(student_id=student_id, assignment_id=assignment.id)
            .first()
        )
        now = datetime.utcnow()

        if draft:
            if draft.status != "draft":
                return {
                    "status": "error",
                    "message": "Este ensayo ya fue entregado formalmente y no se pueden realizar modificaciones.",
                }
            draft.title = title
            draft.content = content
            draft.outline = outline
            draft.last_saved_at = now
        else:
            draft_id = f"draft_{student_id}_{assignment.id}"
            draft = StudentEssay(
                id=draft_id,
                assignment_id=assignment.id,
                student_id=student_id,
                title=title,
                content=content,
                outline=outline,
                status="draft",
                last_saved_at=now,
            )
            db.add(draft)

        db.commit()

        return {
            "status": "success",
            "message": "Borrador de ensayo guardado exitosamente en la base de datos.",
            "assignment_id": assignment.id,
            "title": draft.title,
            "last_saved_at": now.isoformat(),
        }


def submit_student_essay(student_id: int, assignment_id: Union[int, str]) -> Dict[str, Any]:
    """Marca el ensayo del estudiante como entregado formalmente al profesor en PostgreSQL.

    Args:
        student_id: Identificador del estudiante (ej. 12).
        assignment_id: ID entero de PostgreSQL o slug de la tarea (ej. 1 o 'segunda-guerra-mundial').

    Returns:
        Un diccionario con la confirmación de la entrega y fecha de recepción.
    """
    with get_db() as db:
        assignment = _get_assignment(db, assignment_id)
        if not assignment:
            return {
                "status": "error",
                "message": f"No se encontró la tarea con ID o slug '{assignment_id}'.",
            }

        draft = (
            db.query(StudentEssay)
            .filter_by(student_id=student_id, assignment_id=assignment.id)
            .first()
        )
        if not draft:
            return {
                "status": "error",
                "message": "No se encontró ningún borrador para entregar en esta tarea.",
            }

        if draft.status != "draft":
            return {
                "status": "warning",
                "message": "El ensayo ya había sido entregado previamente.",
                "submitted_at": draft.submitted_at.isoformat() if draft.submitted_at else None,
            }

        if not draft.content or len(draft.content.strip()) < 100:
            return {
                "status": "error",
                "message": "El ensayo está vacío o es demasiado corto para una entrega formal. Continúa trabajando en el borrador.",
            }

        now = datetime.utcnow()
        draft.status = "submitted"
        draft.submitted_at = now
        db.commit()

        return {
            "status": "success",
            "message": "¡Felicidades! Tu ensayo ha sido enviado formalmente a tu profesor.",
            "assignment_id": assignment.id,
            "submitted_at": now.isoformat(),
            "title": draft.title,
        }


def search_assignment_documents(assignment_id: Union[int, str], query: str) -> Dict[str, Any]:
    """Busca en los documentos y PDFs que el maestro subió a Cloud Storage indexados con Vertex AI Search.

    Args:
        assignment_id: ID entero de PostgreSQL o slug de la tarea (ej. 1 o 'segunda-guerra-mundial').
        query: Consulta, pregunta temática o concepto histórico a buscar en las lecturas.

    Returns:
        Un diccionario con los fragmentos y citas más relevantes encontrados en los documentos.
    """
    results = search_service.search_documents(assignment_id, query)
    return {
        "status": "success",
        "assignment_id": assignment_id,
        "query": query,
        "results_count": len(results),
        "results": results,
    }
