"""Endpoints REST de login, panel del maestro y trabajo del alumno."""
import re
import unicodedata
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.models import Assignment, AssignmentDocument, Group, StudentEssay, User
from services import documents as document_service
from services.passwords import hash_password, verify_password
from .security import create_token, current_user, db_session, require_student, require_teacher
from .serializers import assignment_out, document_out, essay_out, group_out, user_out

MIN_SUBMIT_CHARS = 100
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

router = APIRouter(prefix="/api")


class LoginIn(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    email: str = Field(pattern=EMAIL_PATTERN, max_length=128)
    password: str = Field(min_length=4, max_length=128)


class NewAssignmentIn(BaseModel):
    group_id: int
    title: str = Field(min_length=1, max_length=256)
    description: str = Field(min_length=1)
    rubric: str = ""
    due_date: datetime | None = None
    min_words: int = Field(default=500, ge=1, le=20000)


class AssignmentUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = Field(default=None, min_length=1)
    rubric: str | None = None
    due_date: datetime | None = None
    min_words: int | None = Field(default=None, ge=1, le=20000)


class GradeIn(BaseModel):
    grade: float = Field(ge=0, le=10)
    feedback: str = ""


class DraftIn(BaseModel):
    title: str = Field(default="", max_length=256)
    content: str = ""
    outline: str = ""


def _to_naive_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _teacher_assignment(db: Session, teacher: User, assignment_id: int) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="No encontramos esta tarea.")
    return assignment


def _essay_of(db: Session, assignment_id: int, student_id: int) -> StudentEssay | None:
    return db.query(StudentEssay).filter_by(assignment_id=assignment_id, student_id=student_id).first()


def teacher_group(db: Session, teacher: User, group_id: int) -> Group:
    group = db.get(Group, group_id)
    if group is None or group.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="No encontramos este grupo.")
    return group


def _group_ids_of(student: User) -> list[int]:
    return [g.id for g in student.groups]


def get_student_assignment(db: Session, student: User, assignment_id: int) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.group_id not in _group_ids_of(student):
        raise HTTPException(status_code=404, detail="No encontramos esta tarea.")
    return assignment


def essays_of(db: Session, assignments: list[Assignment]) -> list[StudentEssay]:
    ids = [a.id for a in assignments]
    return db.query(StudentEssay).filter(StudentEssay.assignment_id.in_(ids)).all() if ids else []


def _student_assignment_out(db: Session, student: User, assignment: Assignment) -> dict:
    return {
        "assignment": assignment_out(assignment),
        "teacher": user_out(assignment.teacher),
        "group": group_out(assignment.group),
        "essay": essay_out(_essay_of(db, assignment.id, student.id)),
    }


# --- Autenticación ---

@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(db_session)):
    user = db.query(User).filter(User.email == body.username.strip().lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    return {"token": create_token(user), "user": user_out(user)}


@router.post("/auth/register")
def register_student(body: RegisterIn, db: Session = Depends(db_session)):
    email = body.email.strip().lower()
    if db.query(User.id).filter_by(email=email).first() is not None:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo. Inicia sesión.")
    student = User(name=body.name.strip(), email=email, role="student", password_hash=hash_password(body.password))
    db.add(student)
    db.commit()
    db.refresh(student)
    return {"token": create_token(student), "user": user_out(student)}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


# --- Maestro ---

@router.get("/teacher/assignments/{assignment_id}")
def assignment_overview(
    assignment_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    assignment = _teacher_assignment(db, teacher, assignment_id)
    members = assignment.group.students
    essays = essays_of(db, [assignment])
    return {
        "group": group_out(assignment.group),
        "assignment": assignment_out(assignment),
        "students": [user_out(s) for s in members],
        # Alumnos que ya no están en el grupo pero trabajaron en esta tarea
        "former_students": [user_out(e.student) for e in essays if e.student not in members],
        "essays": [essay_out(e) for e in essays],
    }


@router.post("/teacher/assignments")
def create_assignment(
    body: NewAssignmentIn,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    group = teacher_group(db, teacher, body.group_id)
    base = unicodedata.normalize("NFD", body.title.lower())
    base = re.sub(r"[̀-ͯ]", "", base)
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:48] or "tarea"
    assignment = Assignment(
        slug=f"{base}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        teacher_id=teacher.id,
        group_id=group.id,
        title=body.title.strip(),
        description=body.description.strip(),
        rubric=body.rubric.strip() or None,
        due_date=_to_naive_utc(body.due_date),
        min_words=body.min_words,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment_out(assignment)


@router.patch("/teacher/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    body: AssignmentUpdateIn,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    assignment = _teacher_assignment(db, teacher, assignment_id)
    fields = body.model_fields_set
    if "title" in fields and body.title is not None:
        assignment.title = body.title.strip()
    if "description" in fields and body.description is not None:
        assignment.description = body.description.strip()
    if "rubric" in fields:
        assignment.rubric = (body.rubric or "").strip() or None
    if "due_date" in fields:
        assignment.due_date = _to_naive_utc(body.due_date)
    if "min_words" in fields and body.min_words is not None:
        assignment.min_words = body.min_words
    db.commit()
    return assignment_out(assignment)


@router.get("/teacher/assignments/{assignment_id}/essays/{student_id}")
def essay_review(
    assignment_id: int,
    student_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    assignment = db.get(Assignment, assignment_id)
    student = db.get(User, student_id)
    if assignment is None or assignment.teacher_id != teacher.id or student is None:
        raise HTTPException(status_code=404, detail="No encontramos este ensayo.")
    essay = _essay_of(db, assignment_id, student_id)
    # Un alumno que cambió de grupo conserva visibles las entregas que ya hizo en este
    if essay is None and student not in assignment.group.students:
        raise HTTPException(status_code=404, detail="No encontramos este ensayo.")
    return {
        "group": group_out(assignment.group),
        "assignment": assignment_out(assignment),
        "student": user_out(student),
        "essay": essay_out(essay),
    }


@router.post("/teacher/essays/{essay_id}/grade")
def grade_essay(
    essay_id: str,
    body: GradeIn,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    essay = db.get(StudentEssay, essay_id)
    if essay is None or essay.assignment.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="No encontramos este ensayo.")
    if essay.status == "draft":
        raise HTTPException(status_code=400, detail="Solo puedes calificar ensayos entregados.")
    essay.grade = round(body.grade, 1)
    essay.feedback = body.feedback.strip() or None
    essay.status = "graded"
    essay.graded_at = datetime.utcnow()
    db.commit()
    return essay_out(essay)


@router.get("/teacher/assignments/{assignment_id}/documents")
def list_documents(
    assignment_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    assignment = _teacher_assignment(db, teacher, assignment_id)
    for doc in assignment.documents:
        document_service.refresh_index_status(doc)
    db.commit()
    return [document_out(doc) for doc in assignment.documents]


@router.post("/teacher/assignments/{assignment_id}/documents")
def upload_documents(
    assignment_id: int,
    files: list[UploadFile] = File(...),
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    assignment = _teacher_assignment(db, teacher, assignment_id)
    uploaded = []
    for upload in files:
        data = upload.file.read(document_service.MAX_PDF_BYTES + 1)
        try:
            doc = document_service.add_document(db, assignment, upload.filename or "documento.pdf", data)
        except document_service.DocumentError as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(exc))
        db.commit()
        uploaded.append(document_out(doc))
    return uploaded


@router.delete("/teacher/documents/{document_id}", status_code=204)
def delete_document(
    document_id: str,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(db_session),
):
    doc = db.get(AssignmentDocument, document_id)
    if doc is None or doc.assignment.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="No encontramos esta lectura.")
    document_service.delete_document(db, doc)
    db.commit()
    return Response(status_code=204)


@router.get("/documents/{document_id}/file")
def document_file(
    document_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
):
    doc = db.get(AssignmentDocument, document_id)
    allowed = doc is not None and (
        doc.assignment.teacher_id == user.id
        if user.role == "teacher"
        else user.role == "student" and doc.assignment.group_id in _group_ids_of(user)
    )
    if not allowed:
        raise HTTPException(status_code=404, detail="No encontramos esta lectura.")
    if not document_service.storage.owns(doc.gcs_uri):
        raise HTTPException(status_code=404, detail="Esta lectura no tiene un archivo disponible.")
    return Response(
        content=document_service.storage.download(doc.gcs_uri),
        media_type=doc.file_type or "application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc.file_name}"'},
    )


# --- Alumno ---

@router.get("/student/assignments")
def student_assignments(student: User = Depends(require_student), db: Session = Depends(db_session)):
    group_ids = _group_ids_of(student)
    assignments = (
        db.query(Assignment)
        .filter(Assignment.group_id.in_(group_ids))
        .order_by(Assignment.created_at.desc())
        .all()
        if group_ids
        else []
    )
    return [_student_assignment_out(db, student, a) for a in assignments]


@router.get("/student/assignments/{assignment_id}")
def student_assignment(
    assignment_id: int,
    student: User = Depends(require_student),
    db: Session = Depends(db_session),
):
    return _student_assignment_out(db, student, get_student_assignment(db, student, assignment_id))


@router.put("/student/assignments/{assignment_id}/essay")
def save_draft(
    assignment_id: int,
    body: DraftIn,
    student: User = Depends(require_student),
    db: Session = Depends(db_session),
):
    get_student_assignment(db, student, assignment_id)
    essay = _essay_of(db, assignment_id, student.id)
    if essay is not None and essay.status != "draft":
        raise HTTPException(status_code=409, detail="Este ensayo ya fue entregado y no se puede modificar.")
    if essay is None:
        essay = StudentEssay(
            id=f"draft_{student.id}_{assignment_id}",
            assignment_id=assignment_id,
            student_id=student.id,
            status="draft",
        )
        db.add(essay)
    essay.title = body.title
    essay.content = body.content
    essay.outline = body.outline
    essay.last_saved_at = datetime.utcnow()
    db.commit()
    return essay_out(essay)


@router.post("/student/assignments/{assignment_id}/submit")
def submit_essay(
    assignment_id: int,
    student: User = Depends(require_student),
    db: Session = Depends(db_session),
):
    get_student_assignment(db, student, assignment_id)
    essay = _essay_of(db, assignment_id, student.id)
    if essay is None:
        raise HTTPException(status_code=400, detail="No encontramos ningún borrador para entregar.")
    if essay.status != "draft":
        raise HTTPException(status_code=409, detail="Este ensayo ya había sido entregado.")
    if len((essay.content or "").strip()) < MIN_SUBMIT_CHARS:
        raise HTTPException(
            status_code=400,
            detail="El ensayo es demasiado corto para entregarlo. Sigue trabajando en tu borrador.",
        )
    essay.status = "submitted"
    essay.submitted_at = datetime.utcnow()
    db.commit()
    return essay_out(essay)
