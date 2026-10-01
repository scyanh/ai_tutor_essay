"""Claves de acceso de grupos y limpieza de tareas al borrar grupos o maestros."""
import secrets

from sqlalchemy.orm import Session

from db.models import Group
from services import documents as document_service

# Sin 0/O ni 1/I/L para que el código se pueda dictar o copiar a mano sin confusiones
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8


def new_join_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(_ALPHABET) for _ in range(CODE_LENGTH))
        if db.query(Group.id).filter_by(join_code=code).first() is None:
            return code


def normalize_code(code: str) -> str:
    return code.strip().upper().replace("-", "").replace(" ", "")


def delete_group(db: Session, group: Group) -> None:
    """Borra el grupo con sus tareas, entregas y lecturas (incluidos los archivos en Cloud Storage)."""
    for assignment in group.assignments:
        for doc in list(assignment.documents):
            document_service.delete_document(db, doc)
    db.flush()
    for assignment in group.assignments:
        db.expire(assignment, ["documents"])
    db.delete(group)
