"""Tokens JWT de sesión y dependencias de autenticación."""
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Iterator

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_TOKEN_TTL = timedelta(hours=int(os.getenv("JWT_TTL_HOURS", "12")))
_SECRET = os.getenv("JWT_SECRET", "")
if not _SECRET:
    _SECRET = secrets.token_urlsafe(48)
    logger.warning("JWT_SECRET no está definido: se usa uno aleatorio y las sesiones no sobreviven reinicios.")

_bearer = HTTPBearer(auto_error=False)


def db_session() -> Iterator[Session]:
    with get_db() as db:
        yield db


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "role": user.role, "iat": now, "exp": now + _TOKEN_TTL}
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(db_session),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tu sesión expiró. Vuelve a iniciar sesión.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, _SECRET, algorithms=[_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


def require_teacher(user: User = Depends(current_user)) -> User:
    if user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para esta acción.")
    return user


def require_student(user: User = Depends(current_user)) -> User:
    if user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para esta acción.")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para esta acción.")
    return user
