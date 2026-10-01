"""Módulo de pruebas automatizadas."""


def user_id(email: str) -> int:
    """Id entero del usuario sembrado con ese email."""
    from db.database import get_db
    from db.models import User

    with get_db() as db:
        return db.query(User).filter_by(email=email).one().id


def add_reading(assignment_slug: str, file_name: str, text: str) -> None:
    """Registra una lectura como si el maestro la hubiera subido (sin Cloud Storage ni Vertex AI Search)."""
    from db.database import get_db
    from db.models import Assignment, AssignmentDocument

    with get_db() as db:
        assignment = db.query(Assignment).filter_by(slug=assignment_slug).one()
        if db.query(AssignmentDocument).filter_by(assignment_id=assignment.id, file_name=file_name).first():
            return
        db.add(AssignmentDocument(
            id=f"test_{file_name.rsplit('.', 1)[0].lower()}"[:64],
            assignment_id=assignment.id,
            file_name=file_name,
            gcs_uri=f"gs://sharon_storage/assignments/{assignment.id}/{file_name}",
            summary=text[:120],
            content_snippet=text,
            index_status="local",
        ))
