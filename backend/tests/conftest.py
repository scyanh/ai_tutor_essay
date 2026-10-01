import os

from sqlalchemy.engine import make_url

# Las pruebas borran y modifican datos: solo corren contra una base de prueba (scripts/test_postgres.sh).
# El nombre es lo que las distingue de Cloud SQL, cuyo proxy también escucha en 127.0.0.1.
_url = make_url(os.environ.get("DATABASE_URL", "postgresql://"))
_database = _url.database or ""
if _url.get_backend_name() != "postgresql" or "test" not in _database:
    raise SystemExit(
        f"Abortado: las pruebas solo corren en una base PostgreSQL de prueba y DATABASE_URL apunta a "
        f"'{_url.get_backend_name()}:{_database}'. Usa `make test`."
    )

# Sin data store las pruebas usan la búsqueda de respaldo y nunca llaman a Vertex AI Search
os.environ["DATA_STORE_ID"] = ""
