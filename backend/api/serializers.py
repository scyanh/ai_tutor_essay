"""Convierte los modelos a la forma que espera el frontend (frontend/src/api/types.ts)."""
from datetime import datetime
from typing import Any

from db.models import Assignment, AssignmentDocument, Group, StudentEssay, User
from services.documents import storage


def iso(value: datetime | None) -> str | None:
    # Las fechas se guardan en UTC sin zona; la "Z" evita que el navegador las lea como hora local
    return f"{value.isoformat(timespec='seconds')}Z" if value else None


def user_out(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "username": user.email,
        "role": user.role,
        "group": (", ".join(g.name for g in user.groups) or None) if user.role == "student" else None,
    }


def group_out(group: Group) -> dict[str, Any]:
    return {
        "id": group.id,
        "name": group.name,
        "join_code": group.join_code,
        "teacher_id": group.teacher_id,
        "created_at": iso(group.created_at),
    }


def assignment_out(assignment: Assignment) -> dict[str, Any]:
    return {
        "id": assignment.id,
        "slug": assignment.slug,
        "teacher_id": assignment.teacher_id,
        "group_id": assignment.group_id,
        "title": assignment.title,
        "description": assignment.description,
        "rubric": assignment.rubric,
        "due_date": iso(assignment.due_date),
        "min_words": assignment.min_words,
        "created_at": iso(assignment.created_at),
        "documents": [document_out(doc) for doc in assignment.documents],
    }


def document_out(doc: AssignmentDocument) -> dict[str, Any]:
    return {
        "id": doc.id,
        "file_name": doc.file_name,
        "summary": doc.summary,
        "index_status": doc.index_status,
        "size_bytes": doc.size_bytes,
        "has_file": storage.owns(doc.gcs_uri),
        "uploaded_at": iso(doc.uploaded_at),
    }


def essay_out(essay: StudentEssay | None) -> dict[str, Any] | None:
    if essay is None:
        return None
    return {
        "id": essay.id,
        "assignment_id": essay.assignment_id,
        "student_id": essay.student_id,
        "title": essay.title or "",
        "content": essay.content or "",
        "outline": essay.outline or "",
        "status": essay.status or "draft",
        "last_saved_at": iso(essay.last_saved_at),
        "submitted_at": iso(essay.submitted_at),
        "grade": essay.grade,
        "feedback": essay.feedback,
        "graded_at": iso(essay.graded_at),
    }
