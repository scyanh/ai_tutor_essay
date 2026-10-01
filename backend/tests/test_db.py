"""Pruebas unitarias de la base de datos y modelos del tutor de ensayos."""
import unittest
from db.database import init_db, get_db
from db.models import User, Assignment, AssignmentDocument, StudentEssay
from db.seed_data import seed_all
from tests import add_reading, user_id

VERSALLES = "El Tratado de Versalles impuso a Alemania reparaciones de guerra y la cláusula de culpabilidad."
EXPANSION = "El rearme alemán y la anexión de Austria precedieron a la invasión de Polonia en 1939."


class TestDatabaseAndModels(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_all()
        add_reading("segunda-guerra-mundial", "Tratado_de_Versalles_y_Crisis_1929.pdf", VERSALLES)
        add_reading("segunda-guerra-mundial", "Expansionismo_Totalitario_y_Detonante_1939.pdf", EXPANSION)

    def test_assignment_exists(self):
        with get_db() as db:
            assignment = db.query(Assignment).filter_by(slug="segunda-guerra-mundial").first()
            self.assertIsNotNone(assignment)
            self.assertIsInstance(assignment.id, int)
            self.assertEqual(assignment.slug, "segunda-guerra-mundial")
            self.assertIn("Segunda Guerra Mundial", assignment.title)
            self.assertGreaterEqual(len(assignment.documents), 2)

            # Verificar que también se puede consultar por su id numérico
            by_id = db.query(Assignment).filter_by(id=assignment.id).first()
            self.assertEqual(by_id.slug, "segunda-guerra-mundial")

    def test_student_draft_exists(self):
        with get_db() as db:
            assignment = db.query(Assignment).filter_by(slug="segunda-guerra-mundial").first()
            self.assertIsNotNone(assignment)
            draft = db.query(StudentEssay).filter_by(
                student_id=user_id("user@gmail.com"),
                assignment_id=assignment.id,
            ).first()
            self.assertIsNotNone(draft)
            self.assertEqual(draft.assignment_id, assignment.id)
            self.assertEqual(draft.status, "draft")
            self.assertIn("Versalles", draft.content)

    def test_documents_attached_to_assignment(self):
        with get_db() as db:
            assignment = db.query(Assignment).filter_by(slug="segunda-guerra-mundial").first()
            self.assertIsNotNone(assignment)
            docs = db.query(AssignmentDocument).filter_by(assignment_id=assignment.id).all()
            self.assertGreaterEqual(len(docs), 2)
            doc_names = [d.file_name for d in docs]
            self.assertIn("Tratado_de_Versalles_y_Crisis_1929.pdf", doc_names)
            self.assertIn("Expansionismo_Totalitario_y_Detonante_1939.pdf", doc_names)


if __name__ == "__main__":
    unittest.main()
