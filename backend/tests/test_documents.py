"""Pruebas de las lecturas en PDF: subida, permisos de descarga y borrado (GCS y Vertex AI Search simulados)."""
import io
import unittest
from unittest import mock

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from db.seed_data import seed_all
from essay_tutor.fast_api_app import app
from services import documents


def blank_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


class TestDocuments(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_all()
        cls.files: dict[str, bytes] = {}
        bucket = documents.storage.bucket_name

        def upload(assignment_id, name, data, content_type="application/pdf"):
            uri = f"gs://{bucket}/assignments/{assignment_id}/{name}"
            cls.files[uri] = data
            return uri

        cls.patches = [
            mock.patch.object(documents.storage, "upload_document", side_effect=upload),
            mock.patch.object(documents.storage, "download", side_effect=lambda uri: cls.files[uri]),
            mock.patch.object(documents.storage, "delete", side_effect=lambda uri: cls.files.pop(uri, None)),
            mock.patch.object(documents, "summarize", return_value="Resumen de prueba"),
            mock.patch.object(type(documents.search), "enabled", new_callable=mock.PropertyMock, return_value=False),
        ]
        for p in cls.patches:
            p.start()
        cls.client = TestClient(app)
        cls.teacher = cls._login("teacher@gmail.com")
        cls.student = cls._login("user@gmail.com")

    @classmethod
    def tearDownClass(cls):
        for p in cls.patches:
            p.stop()

    @classmethod
    def _login(cls, email: str) -> dict:
        res = cls.client.post("/api/auth/login", json={"username": email, "password": "1234"})
        return {"Authorization": f"Bearer {res.json()['token']}"}

    def test_rejects_files_that_are_not_pdf(self):
        res = self.client.post(
            "/api/teacher/assignments/3/documents",
            headers=self.teacher,
            files=[("files", ("notas.pdf", b"hola", "application/pdf"))],
        )
        self.assertEqual(res.status_code, 400)

    def test_upload_download_and_delete(self):
        pdf = blank_pdf()
        res = self.client.post(
            "/api/teacher/assignments/3/documents",
            headers=self.teacher,
            files=[("files", ("Lectura Guerra Fría.pdf", pdf, "application/pdf"))],
        )
        self.assertEqual(res.status_code, 200, res.text)
        doc = res.json()[0]
        self.assertEqual(doc["file_name"], "Lectura_Guerra_Fria.pdf")
        self.assertEqual(doc["index_status"], "local")
        self.assertTrue(doc["has_file"])

        listed = self.client.get("/api/teacher/assignments/3/documents", headers=self.teacher).json()
        self.assertIn(doc["id"], [d["id"] for d in listed])

        res = self.client.get(f"/api/documents/{doc['id']}/file", headers=self.student)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, pdf)
        self.assertEqual(res.headers["content-type"], "application/pdf")

        res = self.client.post(
            "/api/teacher/assignments/3/documents",
            headers=self.student,
            files=[("files", ("x.pdf", pdf, "application/pdf"))],
        )
        self.assertEqual(res.status_code, 403)

        self.assertEqual(self.client.delete(f"/api/teacher/documents/{doc['id']}", headers=self.teacher).status_code, 204)
        self.assertEqual(self.client.get(f"/api/documents/{doc['id']}/file", headers=self.student).status_code, 404)


if __name__ == "__main__":
    unittest.main()
