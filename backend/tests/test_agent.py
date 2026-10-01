"""Pruebas unitarias para las herramientas y servicios del Tutor de Ensayos ADK."""
import unittest
from db.database import get_db
from db.models import StudentEssay
from db.seed_data import seed_all
from tests import add_reading, user_id

VERSALLES = "El Tratado de Versalles impuso a Alemania reparaciones de guerra y la cláusula de culpabilidad."
EXPANSION = "El rearme alemán y la anexión de Austria precedieron a la invasión de Polonia en 1939."
from essay_tutor.tools import (
    get_assignment_details,
    get_student_draft,
    save_student_draft,
    submit_student_essay,
    search_assignment_documents,
)


class TestAgentTools(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_all()
        add_reading("segunda-guerra-mundial", "Tratado_de_Versalles_y_Crisis_1929.pdf", VERSALLES)
        add_reading("segunda-guerra-mundial", "Expansionismo_Totalitario_y_Detonante_1939.pdf", EXPANSION)

    def test_get_assignment_details(self):
        # Consulta por slug
        result = get_assignment_details("segunda-guerra-mundial")
        self.assertEqual(result["status"], "success")
        self.assertIsInstance(result["assignment_id"], int)
        self.assertEqual(result["slug"], "segunda-guerra-mundial")
        self.assertIn("Segunda Guerra Mundial", result["title"])
        self.assertGreaterEqual(len(result["documents"]), 2)

        # Consulta por ID numérico de PostgreSQL
        result_by_id = get_assignment_details(result["assignment_id"])
        self.assertEqual(result_by_id["status"], "success")
        self.assertEqual(result_by_id["title"], result["title"])

    def test_search_assignment_documents(self):
        # Búsqueda por término histórico clave usando slug
        result = search_assignment_documents("segunda-guerra-mundial", "Tratado de Versalles")
        self.assertEqual(result["status"], "success")
        self.assertGreater(result["results_count"], 0)
        first_doc = result["results"][0]
        self.assertIn("Tratado_de_Versalles", first_doc["document"])

        # Búsqueda por ID numérico entero de la base de datos
        assignment_info = get_assignment_details("segunda-guerra-mundial")
        result_by_id = search_assignment_documents(assignment_info["assignment_id"], "Tratado de Versalles")
        self.assertEqual(result_by_id["status"], "success")
        self.assertGreater(result_by_id["results_count"], 0)

    def test_get_and_save_student_draft(self):
        carlos = user_id("user@gmail.com")
        # 1. Obtener borrador
        draft = get_student_draft(carlos, "segunda-guerra-mundial")
        self.assertEqual(draft["status"], "success")
        self.assertEqual(draft["status_essay"], "draft")

        # 2. Guardar actualización de borrador usando slug
        new_content = draft["content"] + "\n\nEn conclusión, Versalles no trajo la paz esperada."
        save_res = save_student_draft(
            student_id=carlos,
            assignment_id="segunda-guerra-mundial",
            title="Las grietas de Versalles (Versión revisada)",
            content=new_content,
            outline=draft["outline"],
        )
        self.assertEqual(save_res["status"], "success")

        # 3. Comprobar que se guardó
        updated_draft = get_student_draft(carlos, "segunda-guerra-mundial")
        self.assertIn("Versión revisada", updated_draft["title"])
        self.assertIn("En conclusión, Versalles no trajo la paz esperada.", updated_draft["content"])

    def test_submit_essay_flow(self):
        student_temp = user_id("ana@alumnos.prepa.edu.mx")
        # Limpiar cualquier borrador previo para que la prueba sea reproducible
        with get_db() as db:
            db.query(StudentEssay).filter_by(student_id=student_temp).delete()

        # Crear un borrador temporal para entrega usando slug
        save_res = save_student_draft(
            student_id=student_temp,
            assignment_id="segunda-guerra-mundial",
            title="Ensayo sobre la Segunda Guerra Mundial por Ana",
            content="Este es un ensayo completo redactado por la estudiante Ana que supera la longitud mínima de cien caracteres para probar la entrega formal al profesor.",
            outline="1. Intro\n2. Desarrollo\n3. Cierre",
        )
        self.assertEqual(save_res["status"], "success")

        # Entregar ensayo
        submit_res = submit_student_essay(student_temp, "segunda-guerra-mundial")
        self.assertEqual(submit_res["status"], "success")
        self.assertIn("enviado formalmente", submit_res["message"])

        # Intentar modificar tras haberlo entregado debe dar error
        attempt_edit = save_student_draft(
            student_id=student_temp,
            assignment_id="segunda-guerra-mundial",
            title="Intento de cambio",
            content="Texto modificado",
            outline="",
        )
        self.assertEqual(attempt_edit["status"], "error")


if __name__ == "__main__":
    unittest.main()
