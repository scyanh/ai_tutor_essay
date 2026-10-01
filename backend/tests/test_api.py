"""Pruebas de la API REST: login, permisos por rol, guardado, entrega y calificación."""
import unittest

from fastapi.testclient import TestClient

from essay_tutor.fast_api_app import app
from db.database import get_db
from db.models import StudentEssay, User
from db.seed_data import seed_all
from services.passwords import hash_password
from tests import user_id


class TestApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_all()
        with get_db() as db:
            db.query(StudentEssay).filter_by(student_id=user_id("user@gmail.com"), assignment_id=3).delete()
        cls.client = TestClient(app)
        cls.teacher = cls._login("teacher@gmail.com")
        cls.student = cls._login("user@gmail.com")

    @classmethod
    def _login(cls, email: str) -> dict:
        res = cls.client.post("/api/auth/login", json={"username": email, "password": "1234"})
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['token']}"}

    def test_login_rejects_wrong_password(self):
        res = self.client.post("/api/auth/login", json={"username": "user@gmail.com", "password": "mala"})
        self.assertEqual(res.status_code, 401)

    def test_me_requires_token(self):
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        res = self.client.get("/api/auth/me", headers=self.teacher)
        self.assertEqual(res.json()["role"], "teacher")

    def test_roles_are_enforced(self):
        self.assertEqual(self.client.get("/api/teacher/groups", headers=self.student).status_code, 403)
        self.assertEqual(self.client.get("/api/student/assignments", headers=self.teacher).status_code, 403)

    def test_group_overview(self):
        groups = self.client.get("/api/teacher/groups", headers=self.teacher).json()
        group = next(g for g in groups if g["name"] == "Historia Universal · 5°A")
        data = self.client.get(f"/api/teacher/groups/{group['id']}", headers=self.teacher).json()
        self.assertGreaterEqual(len(data["students"]), 6)
        self.assertGreaterEqual(len(data["assignments"]), 4)
        self.assertTrue(all(a["due_date"].endswith("Z") for a in data["assignments"] if a["due_date"]))
        self.assertTrue(all(a["group_id"] == group["id"] for a in data["assignments"]))

    def test_students_only_see_their_teachers_work(self):
        with get_db() as db:
            if db.query(User).filter_by(email="sin.grupo@alumnos.prepa.edu.mx").first() is None:
                db.add(User(
                    name="Alumno Sin Grupo",
                    email="sin.grupo@alumnos.prepa.edu.mx",
                    role="student",
                    password_hash=hash_password("1234"),
                ))
        outsider = self._login("sin.grupo@alumnos.prepa.edu.mx")
        self.assertEqual(self.client.get("/api/student/assignments", headers=outsider).json(), [])
        self.assertEqual(self.client.get("/api/student/assignments/1", headers=outsider).status_code, 404)

        outsider_id = user_id("sin.grupo@alumnos.prepa.edu.mx")
        detail = self.client.get("/api/teacher/assignments/1", headers=self.teacher).json()
        self.assertNotIn(outsider_id, [s["id"] for s in detail["students"]])
        res = self.client.get(f"/api/teacher/assignments/1/essays/{outsider_id}", headers=self.teacher)
        self.assertEqual(res.status_code, 404)

    def test_teacher_edits_rubric(self):
        rubric = "1. Tesis (40%)\n2. Evidencia (60%)"
        res = self.client.patch("/api/teacher/assignments/2", headers=self.teacher, json={"rubric": rubric})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["rubric"], rubric)
        mine = self.client.get("/api/student/assignments/2", headers=self.student).json()
        self.assertEqual(mine["assignment"]["rubric"], rubric)
        self.assertEqual(
            self.client.patch("/api/teacher/assignments/2", headers=self.student, json={"rubric": "x"}).status_code,
            403,
        )

    def test_draft_submit_and_grade_flow(self):
        res = self.client.put(
            "/api/student/assignments/3/essay",
            headers=self.student,
            json={"title": "Guatemala y Chile", "content": "Corto", "outline": ""},
        )
        self.assertEqual(res.json()["status"], "draft")

        res = self.client.post("/api/student/assignments/3/submit", headers=self.student)
        self.assertEqual(res.status_code, 400)

        content = "Durante la Guerra Fría, América Latina se convirtió en escenario de la rivalidad entre potencias. " * 3
        self.client.put(
            "/api/student/assignments/3/essay",
            headers=self.student,
            json={"title": "Guatemala y Chile", "content": content, "outline": ""},
        )
        res = self.client.post("/api/student/assignments/3/submit", headers=self.student)
        self.assertEqual(res.json()["status"], "submitted")
        essay_id = res.json()["id"]

        res = self.client.put(
            "/api/student/assignments/3/essay",
            headers=self.student,
            json={"title": "Cambio", "content": content, "outline": ""},
        )
        self.assertEqual(res.status_code, 409)

        res = self.client.post(
            f"/api/teacher/essays/{essay_id}/grade",
            headers=self.teacher,
            json={"grade": 8.75, "feedback": "Buen inicio"},
        )
        self.assertEqual(res.json()["status"], "graded")
        self.assertEqual(res.json()["grade"], 8.8)

        mine = self.client.get("/api/student/assignments/3", headers=self.student).json()
        self.assertEqual(mine["essay"]["feedback"], "Buen inicio")


if __name__ == "__main__":
    unittest.main()
