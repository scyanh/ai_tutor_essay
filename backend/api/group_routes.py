"""Endpoints de grupos: gestión del maestro y unión de alumnos con la clave del grupo."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.models import Assignment, Group, StudentEssay, User
from services import groups as group_service
from .routes import essays_of, teacher_group
from .security import db_session, require_student, require_teacher
from .serializers import assignment_out, essay_out, group_out, user_out

router = APIRouter(prefix="/api")


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class MoveStudentIn(BaseModel):
    group_id: int


class JoinIn(BaseModel):
    code: str = Field(min_length=1, max_length=32)


def _group_summary(db: Session, group: Group) -> dict:
    assignment_ids = [a.id for a in group.assignments]
    member_ids = [s.id for s in group.students]
    pending = (
        db.query(StudentEssay)
        .filter(
            StudentEssay.assignment_id.in_(assignment_ids),
            StudentEssay.student_id.in_(member_ids),
            StudentEssay.status == "submitted",
        )
        .count()
        if assignment_ids and member_ids
        else 0
    )
    return {
        **group_out(group),
        "student_count": len(group.students),
        "assignment_count": len(assignment_ids),
        "pending_count": pending,
        "students_preview": [user_out(s) for s in group.students[:5]],
    }


def _group_student(db: Session, teacher: User, group_id: int, student_id: int) -> tuple[Group, User]:
    group = teacher_group(db, teacher, group_id)
    student = db.get(User, student_id)
    if student is None or student not in group.students:
        raise HTTPException(status_code=404, detail="Este alumno no pertenece al grupo.")
    return group, student


# --- Maestro ---

@router.get("/teacher/groups")
def list_groups(teacher: User = Depends(require_teacher), db: Session = Depends(db_session)):
    return [_group_summary(db, g) for g in teacher.owned_groups]


@router.post("/teacher/groups")
def create_group(body: GroupIn, teacher: User = Depends(require_teacher), db: Session = Depends(db_session)):
    group = Group(teacher_id=teacher.id, name=body.name.strip(), join_code=group_service.new_join_code(db))
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_summary(db, group)


@router.patch("/teacher/groups/{group_id}")
def rename_group(
    group_id: int,
    body: GroupIn,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    group = teacher_group(db, teacher, group_id)
    group.name = body.name.strip()
    db.commit()
    return _group_summary(db, group)


@router.delete("/teacher/groups/{group_id}", status_code=204)
def delete_group(group_id: int, teacher: User = Depends(require_teacher), db: Session = Depends(db_session)):
    group_service.delete_group(db, teacher_group(db, teacher, group_id))
    db.commit()
    return Response(status_code=204)


@router.post("/teacher/groups/{group_id}/join-code")
def regenerate_join_code(
    group_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    group = teacher_group(db, teacher, group_id)
    group.join_code = group_service.new_join_code(db)
    db.commit()
    return _group_summary(db, group)


@router.get("/teacher/groups/{group_id}")
def group_overview(group_id: int, teacher: User = Depends(require_teacher), db: Session = Depends(db_session)):
    group = teacher_group(db, teacher, group_id)
    assignments = (
        db.query(Assignment).filter_by(group_id=group.id).order_by(Assignment.created_at.desc()).all()
    )
    return {
        "group": _group_summary(db, group),
        "students": [user_out(s) for s in group.students],
        "assignments": [assignment_out(a) for a in assignments],
        "essays": [essay_out(e) for e in essays_of(db, assignments)],
    }


@router.delete("/teacher/groups/{group_id}/students/{student_id}", status_code=204)
def remove_student(
    group_id: int,
    student_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    group, student = _group_student(db, teacher, group_id, student_id)
    group.students.remove(student)
    db.commit()
    return Response(status_code=204)


@router.post("/teacher/groups/{group_id}/students/{student_id}/move", status_code=204)
def move_student(
    group_id: int,
    student_id: int,
    body: MoveStudentIn,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    group, student = _group_student(db, teacher, group_id, student_id)
    target = teacher_group(db, teacher, body.group_id)
    if target.id == group.id:
        raise HTTPException(status_code=400, detail="El alumno ya está en este grupo.")
    group.students.remove(student)
    if student not in target.students:
        target.students.append(student)
    db.commit()
    return Response(status_code=204)


# --- Alumno ---

@router.get("/student/groups")
def student_groups(student: User = Depends(require_student)):
    return [{**group_out(g), "teacher_name": g.teacher.name} for g in student.groups]


@router.post("/student/groups/join")
def join_group(body: JoinIn, student: User = Depends(require_student), db: Session = Depends(db_session)):
    group = db.query(Group).filter_by(join_code=group_service.normalize_code(body.code)).first()
    if group is None:
        raise HTTPException(status_code=404, detail="No encontramos ningún grupo con esa clave. Revísala con tu maestro.")
    if student in group.students:
        raise HTTPException(status_code=409, detail=f"Ya formas parte de «{group.name}».")
    group.students.append(student)
    db.commit()
    return {**group_out(group), "teacher_name": group.teacher.name}
