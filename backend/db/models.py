"""Modelos relacionales de base de datos para tareas, borradores y usuarios."""
from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Text, DateTime, ForeignKey, Index, Table
from sqlalchemy.orm import relationship
from .database import Base


# Pertenencia de alumnos a grupos: un alumno puede estar en grupos de varios maestros
group_students = Table(
    "group_students",
    Base.metadata,
    Column("group_id", Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    Column("student_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
    Column("created_at", DateTime, default=datetime.utcnow),
)


class User(Base):
    """Modelo para usuarios del sistema (Administradores, Profesores y Alumnos)."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(128), nullable=False)
    email = Column(String(128), unique=True, nullable=False, index=True)
    role = Column(String(32), nullable=False)  # 'admin' | 'teacher' | 'student'
    password_hash = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relaciones
    created_assignments = relationship("Assignment", back_populates="teacher")
    essays = relationship("StudentEssay", back_populates="student")
    owned_groups = relationship(
        "Group", back_populates="teacher", cascade="all, delete-orphan", order_by="Group.created_at"
    )
    groups = relationship("Group", secondary=group_students, back_populates="students")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
        }


class Group(Base):
    """Grupo de un maestro; los alumnos se unen escribiendo su clave (join_code)."""
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    join_code = Column(String(16), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    teacher = relationship("User", back_populates="owned_groups")
    students = relationship("User", secondary=group_students, back_populates="groups", order_by="User.name")
    assignments = relationship("Assignment", back_populates="group", cascade="all, delete-orphan")


class Assignment(Base):
    """Modelo para tareas de ensayos dejadas por los maestros."""
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    slug = Column(String(64), unique=True, nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    title = Column(String(256), nullable=False)
    description = Column(Text, nullable=False)  # Instrucciones del ensayo
    rubric = Column(Text, nullable=True)        # Criterios de evaluación
    gcs_folder_uri = Column(String(512), nullable=True)  # Carpeta en GCS gs://bucket/...
    datastore_id = Column(String(256), nullable=True)    # Datastore en Vertex AI Search
    due_date = Column(DateTime, nullable=True)
    min_words = Column(Integer, nullable=False, default=500)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relaciones
    teacher = relationship("User", back_populates="created_assignments")
    group = relationship("Group", back_populates="assignments")
    documents = relationship("AssignmentDocument", back_populates="assignment", cascade="all, delete-orphan")
    student_essays = relationship("StudentEssay", back_populates="assignment", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "slug": self.slug,
            "teacher_id": self.teacher_id,
            "group_id": self.group_id,
            "title": self.title,
            "description": self.description,
            "rubric": self.rubric,
            "gcs_folder_uri": self.gcs_folder_uri,
            "datastore_id": self.datastore_id,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "documents": [doc.to_dict() for doc in self.documents] if self.documents else [],
        }


class AssignmentDocument(Base):
    """Documentos subidos por el maestro a GCS e indexados en Vertex AI Search."""
    __tablename__ = "assignment_documents"

    id = Column(String(64), primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    file_name = Column(String(256), nullable=False)
    gcs_uri = Column(String(512), nullable=False)
    file_type = Column(String(64), default="application/pdf")
    summary = Column(Text, nullable=True)
    content_snippet = Column(Text, nullable=True)  # Para fallback de búsqueda local
    # 'local' (solo búsqueda en PostgreSQL) | 'indexing' | 'indexed' | 'error' en Vertex AI Search
    index_status = Column(String(32), nullable=False, default="local")
    size_bytes = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relaciones
    assignment = relationship("Assignment", back_populates="documents")

    def to_dict(self):
        return {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "file_name": self.file_name,
            "gcs_uri": self.gcs_uri,
            "file_type": self.file_type,
            "summary": self.summary,
        }


class StudentEssay(Base):
    """Progreso del ensayo de un estudiante (Borrador / Entrega final)."""
    __tablename__ = "student_essays"
    __table_args__ = (
        Index("ux_student_essays_assignment_student", "assignment_id", "student_id", unique=True),
    )

    id = Column(String(64), primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(256), nullable=True)
    content = Column(Text, nullable=True)       # Texto actual del ensayo
    outline = Column(Text, nullable=True)       # Esquema, tesis y argumentos preliminares
    status = Column(String(32), default="draft")  # 'draft' | 'submitted' | 'graded'
    last_saved_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    grade = Column(Float, nullable=True)        # Calificación de 0 a 10
    feedback = Column(Text, nullable=True)      # Retroalimentación del maestro
    graded_at = Column(DateTime, nullable=True)

    # Relaciones
    assignment = relationship("Assignment", back_populates="student_essays")
    student = relationship("User", back_populates="essays")

    def to_dict(self):
        return {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "student_id": self.student_id,
            "title": self.title,
            "content": self.content,
            "outline": self.outline,
            "status": self.status,
            "last_saved_at": self.last_saved_at.isoformat() if self.last_saved_at else None,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }
