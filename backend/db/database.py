"""Configuración de base de datos con SQLAlchemy para PostgreSQL."""
import os
from contextlib import contextmanager
from urllib.parse import quote
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()


def _database_url() -> str:
    """DATABASE_URL explícita, o la URL de Cloud SQL armada con las variables del despliegue en Cloud Run."""
    if url := os.getenv("DATABASE_URL"):
        return url
    instance = os.getenv("INSTANCE_CONNECTION_NAME")
    password = os.getenv("DB_PASS")
    if instance and password:
        user = quote(os.getenv("DB_USER", "postgres"), safe="")
        name = os.getenv("DB_NAME", "postgres")
        return f"postgresql+psycopg2://{user}:{quote(password, safe='')}@/{name}?host=/cloudsql/{instance}"
    raise RuntimeError(
        "Falta la conexión a PostgreSQL: define DATABASE_URL (por ejemplo, el Cloud SQL Auth Proxy en "
        "127.0.0.1) o INSTANCE_CONNECTION_NAME y DB_PASS."
    )


DATABASE_URL = _database_url()

# La instancia de Cloud SQL es compartida con otros proyectos: pocas conexiones por proceso
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_size=int(os.getenv("DB_POOL_SIZE", "3")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "2")),
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db():
    """Crea todas las tablas si no existen."""
    from . import models  # Asegurar registro de modelos
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_db():
    """Context manager para obtener sesiones de base de datos."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
