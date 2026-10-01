"""Servicio de gestión de archivos en Google Cloud Storage (GCS) para tareas docentes."""
import os
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


class StorageService:
    """Gestiona la subida, descarga y borrado de las lecturas de referencia en Cloud Storage."""

    def __init__(self, bucket_name: Optional[str] = None):
        self.bucket_name = bucket_name or os.getenv("GCS_BUCKET_NAME", "sharon_storage")
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from google.cloud import storage

            self._client = storage.Client()
        return self._client

    def blob_path(self, assignment_id: int | str, file_name: str) -> str:
        return f"assignments/{assignment_id}/{file_name}"

    def owns(self, gcs_uri: str | None) -> bool:
        """Indica si el URI apunta a este bucket (las lecturas del seed original no tienen archivo real)."""
        return bool(gcs_uri) and gcs_uri.startswith(f"gs://{self.bucket_name}/")

    def upload_document(self, assignment_id: int | str, file_name: str, content: bytes,
                        content_type: str = "application/pdf") -> str:
        """Sube un archivo de referencia de un maestro a GCS para una tarea específica.

        Returns:
            URI en Cloud Storage: gs://<bucket>/assignments/<assignment_id>/<file_name>
        """
        path = self.blob_path(assignment_id, file_name)
        self.client.bucket(self.bucket_name).blob(path).upload_from_string(content, content_type=content_type)
        return f"gs://{self.bucket_name}/{path}"

    def download(self, gcs_uri: str) -> bytes:
        path = gcs_uri.removeprefix(f"gs://{self.bucket_name}/")
        return self.client.bucket(self.bucket_name).blob(path).download_as_bytes()

    def delete(self, gcs_uri: str) -> None:
        from google.api_core.exceptions import NotFound

        path = gcs_uri.removeprefix(f"gs://{self.bucket_name}/")
        try:
            self.client.bucket(self.bucket_name).blob(path).delete()
        except NotFound:
            pass

    def get_public_or_gcs_uri(self, assignment_id: str, file_name: str) -> str:
        """Devuelve el URI canónico del documento en Cloud Storage."""
        return f"gs://{self.bucket_name}/{self.blob_path(assignment_id, file_name)}"
