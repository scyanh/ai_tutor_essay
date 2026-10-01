"""Pruebas de grupos: gestión del maestro, unión con clave, registro de alumnos y administración de maestros."""
import unittest
import uuid

from fastapi.testclient import TestClient

from essay_tutor.fast_api_app import app
from db.database import get_db
from db.models import Assignment, StudentEssay, User
from db.seed_data import seed_all
from tests import user_id


class TestGroups(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_all()
        cls.client = TestClient(app)
        cls.teacher = cls._login("teacher@gmail.com")
        cls.admin = cls._login("admin@gmail.com")

    @classmethod
    def _login(cls, email: str, password: str = "1234") -> dict:
        res = cls.client.post("/api/auth/login", json={"username": email, "password": password})
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['token']}"}

    def _new_group(self, name: str) -> dict:
        res = self.client.post("/api/teacher/groups", headers=self.teacher, json={"name": name})
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()

    def _register(self, name: str = "Alumna Nueva") -> tuple[dict, str]:
        email = f"alumno.{uuid.uuid4().hex[:8]}@alumnos.prepa.edu.mx"
        res = self.client.post("/api/auth/register", json={"name": name, "email": email, "password": "secreta"})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["user"]["role"], "student")
        return {"Authorization": f"Bearer {res.json()['token']}"}, email

    def test_seeded_groups_have_codes(self):
        groups = self.client.get("/api/teacher/groups", headers=self.teacher).json()
        names = [g["name"] for g in groups]
        self.assertIn("Historia Universal · 5°A", names)
        self.assertIn("Historia Universal · 5°B", names)
        for g in groups:
            self.assertEqual(len(g["join_code"]), 8)
        group_a = next(g for g in groups if g["name"].endswith("5°A"))
        self.assertGreaterEqual(group_a["student_count"], 6)
        self.assertGreaterEqual(group_a["assignment_count"], 4)

    def test_register_then_join_with_code(self):
        student, email = self._register()
        self.assertEqual(self.client.get("/api/student/groups", headers=student).json(), [])
        self.assertEqual(self.client.get("/api/student/assignments", headers=student).json(), [])

        group = self._new_group("Literatura · 6°C")
        res = self.client.post("/api/student/groups/join", headers=student, json={"code": "zzzz-zzzz"})
        self.assertEqual(res.status_code, 404)
        spaced = f" {group['join_code'][:4].lower()}-{group['join_code'][4:]} "
        res = self.client.post("/api/student/groups/join", headers=student, json={"code": spaced})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["name"], "Literatura · 6°C")
        res = self.client.post("/api/student/groups/join", headers=student, json={"code": group["join_code"]})
        self.assertEqual(res.status_code, 409)

        me = self.client.get("/api/auth/me", headers=student).json()
        self.assertEqual(me["group"], "Literatura · 6°C")
        overview = self.client.get(f"/api/teacher/groups/{group['id']}", headers=self.teacher).json()
        self.assertIn(user_id(email), [s["id"] for s in overview["students"]])

        res = self.client.post("/api/auth/register", json={"name": "Otra", "email": email, "password": "secreta"})
        self.assertEqual(res.status_code, 409)

    def test_regenerated_code_invalidates_old_one(self):
        group = self._new_group("Filosofía · 6°A")
        res = self.client.post(f"/api/teacher/groups/{group['id']}/join-code", headers=self.teacher)
        new_code = res.json()["join_code"]
        self.assertNotEqual(new_code, group["join_code"])
        student, _ = self._register()
        old = self.client.post("/api/student/groups/join", headers=student, json={"code": group["join_code"]})
        self.assertEqual(old.status_code, 404)
        new = self.client.post("/api/student/groups/join", headers=student, json={"code": new_code})
        self.assertEqual(new.status_code, 200)

    def test_group_assignments_are_scoped(self):
        group = self._new_group("Ética · 4°B")
        student, _ = self._register()
        self.client.post("/api/student/groups/join", headers=student, json={"code": group["join_code"]})
        res = self.client.post("/api/teacher/assignments", headers=self.teacher, json={
            "group_id": group["id"], "title": "Ensayo: Ética y tecnología", "description": "Argumenta.",
        })
        self.assertEqual(res.status_code, 200, res.text)
        assignment_id = res.json()["id"]

        mine = self.client.get("/api/student/assignments", headers=student).json()
        self.assertEqual([i["assignment"]["id"] for i in mine], [assignment_id])
        carlos = self._login("user@gmail.com")
        self.assertEqual(self.client.get(f"/api/student/assignments/{assignment_id}", headers=carlos).status_code, 404)

    def test_move_and_remove_student(self):
        source = self._new_group("Origen")
        target = self._new_group("Destino")
        student, email = self._register()
        sid = user_id(email)
        self.client.post("/api/student/groups/join", headers=student, json={"code": source["join_code"]})

        res = self.client.post(
            f"/api/teacher/groups/{source['id']}/students/{sid}/move", headers=self.teacher,
            json={"group_id": target["id"]},
        )
        self.assertEqual(res.status_code, 204, res.text)
        src = self.client.get(f"/api/teacher/groups/{source['id']}", headers=self.teacher).json()
        dst = self.client.get(f"/api/teacher/groups/{target['id']}", headers=self.teacher).json()
        self.assertNotIn(sid, [s["id"] for s in src["students"]])
        self.assertIn(sid, [s["id"] for s in dst["students"]])

        assignment = self.client.post("/api/teacher/assignments", headers=self.teacher, json={
            "group_id": target["id"], "title": "Ensayo: Antes de salir", "description": "x",
        }).json()
        self.client.put(
            f"/api/student/assignments/{assignment['id']}/essay", headers=student,
            json={"title": "t", "content": "algo", "outline": ""},
        )

        res = self.client.delete(f"/api/teacher/groups/{target['id']}/students/{sid}", headers=self.teacher)
        self.assertEqual(res.status_code, 204)
        detail = self.client.get(f"/api/teacher/assignments/{assignment['id']}", headers=self.teacher).json()
        self.assertNotIn(sid, [s["id"] for s in detail["students"]])
        self.assertEqual([s["id"] for s in detail["former_students"]], [sid])
        review = self.client.get(f"/api/teacher/assignments/{assignment['id']}/essays/{sid}", headers=self.teacher)
        self.assertEqual(review.status_code, 200)
        self.assertEqual(self.client.get("/api/student/groups", headers=student).json(), [])
        again = self.client.delete(f"/api/teacher/groups/{target['id']}/students/{sid}", headers=self.teacher)
        self.assertEqual(again.status_code, 404)

    def test_rename_and_delete_group_with_work(self):
        group = self._new_group("Temporal")
        res = self.client.patch(f"/api/teacher/groups/{group['id']}", headers=self.teacher, json={"name": "Renombrado"})
        self.assertEqual(res.json()["name"], "Renombrado")

        student, email = self._register()
        self.client.post("/api/student/groups/join", headers=student, json={"code": group["join_code"]})
        assignment = self.client.post("/api/teacher/assignments", headers=self.teacher, json={
            "group_id": group["id"], "title": "Ensayo: Borrable", "description": "x",
        }).json()
        self.client.put(
            f"/api/student/assignments/{assignment['id']}/essay", headers=student,
            json={"title": "t", "content": "algo", "outline": ""},
        )

        res = self.client.delete(f"/api/teacher/groups/{group['id']}", headers=self.teacher)
        self.assertEqual(res.status_code, 204, res.text)
        with get_db() as db:
            self.assertIsNone(db.get(Assignment, assignment["id"]))
            self.assertEqual(db.query(StudentEssay).filter_by(assignment_id=assignment["id"]).count(), 0)
            self.assertIsNotNone(db.query(User).filter_by(email=email).first())

    def test_teachers_cannot_touch_other_teachers_groups(self):
        res = self.client.post("/api/admin/teachers", headers=self.admin, json={
            "name": "Profa. Invitada", "email": f"invitada.{uuid.uuid4().hex[:6]}@prepa.edu.mx", "password": "1234",
        })
        other = self._login(res.json()["email"])
        mine = self._new_group("Privado")
        self.assertEqual(self.client.get(f"/api/teacher/groups/{mine['id']}", headers=other).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/teacher/groups/{mine['id']}", headers=other).status_code, 404)
        res = self.client.post("/api/teacher/assignments", headers=other, json={
            "group_id": mine["id"], "title": "Intruso", "description": "x",
        })
        self.assertEqual(res.status_code, 404)

    def test_admin_manages_teachers_only(self):
        self.assertEqual(self.client.get("/api/admin/teachers", headers=self.teacher).status_code, 403)
        self.assertEqual(self.client.get("/api/teacher/groups", headers=self.admin).status_code, 403)

        teachers = self.client.get("/api/admin/teachers", headers=self.admin).json()
        roberto = next(t for t in teachers if t["email"] == "teacher@gmail.com")
        self.assertGreaterEqual(roberto["group_count"], 2)
        self.assertGreaterEqual(roberto["student_count"], 8)

        email = f"nuevo.{uuid.uuid4().hex[:6]}@prepa.edu.mx"
        created = self.client.post("/api/admin/teachers", headers=self.admin, json={
            "name": "Prof. Nuevo", "email": email.upper(), "password": "clave1",
        })
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["email"], email)
        dup = self.client.post("/api/admin/teachers", headers=self.admin, json={
            "name": "Otro", "email": email, "password": "clave1",
        })
        self.assertEqual(dup.status_code, 409)

        tid = created.json()["id"]
        res = self.client.patch(f"/api/admin/teachers/{tid}", headers=self.admin, json={"name": "Prof. Renombrado", "password": "clave2"})
        self.assertEqual(res.json()["name"], "Prof. Renombrado")
        new_teacher = self._login(email, "clave2")
        group = self.client.post("/api/teacher/groups", headers=new_teacher, json={"name": "Grupo del nuevo"}).json()
        self.client.post("/api/teacher/assignments", headers=new_teacher, json={
            "group_id": group["id"], "title": "Ensayo: Uno", "description": "x",
        })

        student_id = user_id("user@gmail.com")
        self.assertEqual(self.client.patch(f"/api/admin/teachers/{student_id}", headers=self.admin, json={"name": "Xavier"}).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/admin/teachers/{tid}", headers=self.admin).status_code, 204)
        res = self.client.post("/api/auth/login", json={"username": email, "password": "clave2"})
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
