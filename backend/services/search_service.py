"""Servicio de búsqueda RAG conectado a Vertex AI Search y soporte local."""
import logging
import os
import re
from typing import List, Dict, Any, Optional, Union

from dotenv import load_dotenv

from db.database import get_db
from db.models import Assignment, AssignmentDocument

load_dotenv()

logger = logging.getLogger(__name__)


class SearchService:
    """Gestiona la búsqueda semántica en documentos mediante Vertex AI Search o fallback local."""

    def __init__(self):
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        self.region = os.getenv("DATA_STORE_REGION", "global")
        self.collection = os.getenv("DATA_STORE_COLLECTION", "default_collection")
        self.data_store_id = os.getenv("DATA_STORE_ID", "essay-tutor-datastore")

    @property
    def enabled(self) -> bool:
        return bool(self.project_id and self.data_store_id)

    def get_data_store_path(self) -> str:
        """Retorna la ruta completa del datastore en Vertex AI Search."""
        return (
            f"projects/{self.project_id}/locations/{self.region}"
            f"/collections/{self.collection}/dataStores/{self.data_store_id}"
        )

    def _document_name(self, doc: AssignmentDocument) -> str:
        return f"{self.get_data_store_path()}/branches/default_branch/documents/{self.search_document_id(doc)}"

    @staticmethod
    def search_document_id(doc: AssignmentDocument) -> str:
        # Vertex AI Search acepta [a-zA-Z0-9-_] y hasta 63 caracteres
        return re.sub(r"[^a-zA-Z0-9_-]", "-", f"a{doc.assignment_id}-{doc.id}")[:63]

    # --- Indexación ---

    def index_document(self, doc: AssignmentDocument) -> None:
        """Importa (o reemplaza) el PDF en el data store con su assignment_id para filtrar las búsquedas."""
        from google.cloud import discoveryengine_v1 as discoveryengine

        document = discoveryengine.Document(
            id=self.search_document_id(doc),
            struct_data={
                "assignment_id": str(doc.assignment_id),
                "file_name": doc.file_name,
                "title": doc.file_name.rsplit(".", 1)[0].replace("_", " "),
            },
            content=discoveryengine.Document.Content(mime_type=doc.file_type or "application/pdf", uri=doc.gcs_uri),
        )
        operation = discoveryengine.DocumentServiceClient().import_documents(
            request=discoveryengine.ImportDocumentsRequest(
                parent=f"{self.get_data_store_path()}/branches/default_branch",
                inline_source=discoveryengine.ImportDocumentsRequest.InlineSource(documents=[document]),
                reconciliation_mode=discoveryengine.ImportDocumentsRequest.ReconciliationMode.INCREMENTAL,
            )
        )
        result = operation.result(timeout=300)
        if result.error_samples:
            raise RuntimeError(result.error_samples[0].message)

    def index_state(self, doc: AssignmentDocument) -> str:
        """'indexed' cuando Vertex AI Search terminó, 'indexing' mientras procesa y 'error' si falló."""
        from google.api_core.exceptions import NotFound
        from google.cloud import discoveryengine_v1 as discoveryengine

        try:
            remote = discoveryengine.DocumentServiceClient().get_document(name=self._document_name(doc))
        except NotFound:
            return "error"
        if remote.index_status and remote.index_status.error_samples:
            return "error"
        return "indexed" if remote.index_time else "indexing"

    def delete_document(self, doc: AssignmentDocument) -> None:
        from google.api_core.exceptions import NotFound
        from google.cloud import discoveryengine_v1 as discoveryengine

        try:
            discoveryengine.DocumentServiceClient().delete_document(name=self._document_name(doc))
        except NotFound:
            pass

    # --- Búsqueda ---

    def _resolve_assignment_id(self, db, identifier: Union[int, str]) -> Optional[int]:
        """Resuelve el ID entero de la tarea a partir de un int o un slug textual."""
        if isinstance(identifier, int):
            return identifier
        if isinstance(identifier, str):
            if identifier.isdigit():
                return int(identifier)
            assignment = db.query(Assignment).filter_by(slug=identifier).first()
            return assignment.id if assignment else None
        return None

    def search_documents(self, assignment_id: Union[int, str], query: str) -> List[Dict[str, Any]]:
        """Busca en los documentos subidos por el maestro para una tarea.

        Args:
            assignment_id: ID numérico de la tarea en PostgreSQL (int) o su slug (ej. 'segunda-guerra-mundial').
            query: Pregunta o palabras clave del estudiante.

        Returns:
            Lista de fragmentos relevantes con documento, páginas y texto.
        """
        with get_db() as db:
            target_id = self._resolve_assignment_id(db, assignment_id)
        if target_id is None:
            return []

        if self.enabled:
            try:
                results = self._search_vertex(target_id, query)
                if results:
                    return results
            except Exception:
                logger.exception("Vertex AI Search falló; se usa la búsqueda local")

        return self._search_local_documents(target_id, query)

    def _search_vertex(self, assignment_id: int, query: str) -> List[Dict[str, Any]]:
        from google.cloud import discoveryengine_v1 as discoveryengine

        spec = discoveryengine.SearchRequest.ContentSearchSpec
        request = discoveryengine.SearchRequest(
            serving_config=f"{self.get_data_store_path()}/servingConfigs/default_search",
            query=query,
            page_size=5,
            filter=f'assignment_id: ANY("{assignment_id}")',
            content_search_spec=spec(search_result_mode=spec.SearchResultMode.CHUNKS),
        )
        results = []
        for result in discoveryengine.SearchServiceClient().search(request).results:
            chunk = result.chunk
            pages = chunk.page_span
            results.append({
                "document": f"{chunk.document_metadata.title}.pdf",
                "pages": f"{pages.page_start}-{pages.page_end}" if pages.page_start != pages.page_end else str(pages.page_start),
                "content": chunk.content,
            })
        return results

    def _search_local_documents(self, assignment_id: Union[int, str], query: str) -> List[Dict[str, Any]]:
        """Respaldo si Vertex AI Search falla: busca en el texto extraído de los PDFs guardado en PostgreSQL."""
        results = []
        query_words = [w.lower() for w in query.split() if len(w) > 3]

        with get_db() as db:
            target_id = self._resolve_assignment_id(db, assignment_id)
            if target_id is None:
                return []

            docs = db.query(AssignmentDocument).filter_by(assignment_id=target_id).all()
            for doc in docs:
                content = doc.content_snippet or doc.summary or ""
                relevance = 0
                for word in query_words:
                    if word in content.lower():
                        relevance += 1

                # Si hay coincidencia o la consulta es general
                if relevance > 0 or not query_words:
                    results.append({
                        "document": doc.file_name,
                        "gcs_uri": doc.gcs_uri,
                        "summary": doc.summary,
                        "snippet": content[:600] + ("..." if len(content) > 600 else ""),
                    })

        # Si no hubo coincidencia específica, devolver los documentos asociados a la tarea
        if not results:
            with get_db() as db:
                target_id = self._resolve_assignment_id(db, assignment_id)
                if target_id is not None:
                    docs = db.query(AssignmentDocument).filter_by(assignment_id=target_id).all()
                    for doc in docs:
                        results.append({
                            "document": doc.file_name,
                            "gcs_uri": doc.gcs_uri,
                            "summary": doc.summary,
                            "snippet": (doc.content_snippet or "")[:500],
                        })

        return results
