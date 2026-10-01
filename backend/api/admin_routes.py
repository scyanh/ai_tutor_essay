"""Endpoints del administrador: alta, edición y baja de maestros."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.models import Assignment, User
from services import groups as group_service
from services.passwords import hash_password
from .routes import EMAIL_PATTERN
from .security import db_session, require_admin
from .serializers import iso, user_out

router = APIRouter(prefix="/api/admin")


class TeacherIn(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    email: str = Field(pattern=EMAIL_PATTERN, max_length=128)
    password: str = Field(min_length=4, max_length=128)


class TeacherUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=128)
    email: str | None = Field(default=None, pattern=EMAIL_PATTERN, max_length=128)
    password: str | None = Field(default=None, min_length=4, max_length=128)


def _teacher(db: Session, teacher_id: int) -> User:
    teacher = db.get(User, teacher_id)
    if teacher is None or teacher.role != "teacher":
        raise HTTPException(status_code=404, detail="No encontramos a este maestro.")
    return teacher


def _email_taken(db: Session, email: str, exclude_id: int | None = None) -> bool:
    query = db.query(User.id).filter(User.email == email)
    if exclude_id is not None:
        query = query.filter(User.id != exclude_id)
    return query.first() is not None


def _teacher_out(db: Session, teacher: User) -> dict:
    groups = teacher.owned_groups
    return {
        **user_out(teacher),
        "created_at": iso(teacher.created_at),
        "group_count": len(groups),
        "student_count": len({s.id for g in groups for s in g.students}),
        "assignment_count": db.query(Assignment).filter_by(teacher_id=teacher.id).count(),
    }


@router.get("/teachers")
def list_teachers(_admin: User = Depends(require_admin), db: Session = Depends(db_session)):
    teachers = db.query(User).filter_by(role="teacher").order_by(User.name).all()
    return [_teacher_out(db, t) for t in teachers]


@router.post("/teachers")
def create_teacher(body: TeacherIn, _admin: User = Depends(require_admin), db: Session = Depends(db_session)):
    email = body.email.strip().lower()
    if _email_taken(db, email):
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo.")
    teacher = User(name=body.name.strip(), email=email, role="teacher", password_hash=hash_password(body.password))
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return _teacher_out(db, teacher)


@router.patch("/teachers/{teacher_id}")
def update_teacher(
    teacher_id: int,
    body: TeacherUpdateIn,
    _admin: User = Depends(require_admin),
    db: Session = Depends(db_session),
):
    teacher = _teacher(db, teacher_id)
    if body.name is not None:
        teacher.name = body.name.strip()
    if body.email is not None:
        email = body.email.strip().lower()
        if _email_taken(db, email, exclude_id=teacher.id):
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo.")
        teacher.email = email
    if body.password:
        teacher.password_hash = hash_password(body.password)
    db.commit()
    return _teacher_out(db, teacher)


@router.delete("/teachers/{teacher_id}", status_code=204)
def delete_teacher(teacher_id: int, _admin: User = Depends(require_admin), db: Session = Depends(db_session)):
    teacher = _teacher(db, teacher_id)
    for group in list(teacher.owned_groups):
        group_service.delete_group(db, group)
    db.flush()
    db.expire(teacher)
    db.delete(teacher)
    db.commit()
    return Response(status_code=204)
