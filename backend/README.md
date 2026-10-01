# Backend: Tutor de Ensayos con Google ADK, PostgreSQL y Vertex AI Search RAG

Backend inteligente desarrollado en Python con **Google Agent Development Kit (ADK)** diseñado para apoyar a estudiantes de preparatoria en la redacción, estructuración y mejora de ensayos académicos.

Integra conexión a **PostgreSQL** para tareas docentes y control de versiones de borradores de alumnos, **Google Cloud Storage (GCS)** para almacenamiento de documentos de referencia (PDFs) subidos por los maestros, y **Vertex AI Search** para recuperación contextual (RAG).

---

## 🏛️ Arquitectura Multiagente

El sistema utiliza una arquitectura multiagente con un orquestador central y tres subagentes especializados:

```
                      +-----------------------------+
                      |   Tutor Orquestador (Root)  |
                      |         (essay_tutor)       |
                      |  - Regla: NO redacta ensayo |
                      |  - Enfoque pedagógico socrático |
                      +--------------+--------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
+------------------+       +-------------------+       +-------------------+
| ResearchSpecialist|      | StructureSpecialist|      |    StyleCoach     |
| (research_specialist)|   | (structure_specialist)|   |   (style_coach)   |
| - Búsqueda RAG   |       | - Planteamiento Tesis|     | - Conectores      |
| - Vertex AI Search|      | - Estructura CER  |       | - Tono académico  |
| - Citas de fuentes|      | - Rúbrica docente |       | - Sintaxis y estilo|
+------------------+       +-------------------+       +-------------------+
```

### 🛡️ Guardrail Pedagógico Fundamental
El tutor tiene la directriz inquebrantable de **NUNCA escribir el ensayo en lugar del alumno**:
- Si el estudiante solicita que le redacten la introducción, un argumento o párrafos completos, el tutor lo declina amablemente.
- En su lugar, realiza preguntas reflexivas (método socrático), ofrece contraejemplos o esquemas de pensamiento (Afirmación-Evidencia-Razonamiento) y orienta sobre cómo fundamentar la postura con los documentos del maestro.

---

## 🗄️ Esquema de Base de Datos (PostgreSQL)

Base `sharon_education` en la instancia compartida `tlanova:us-central1:tlanovadb`. Solo se escribe en esa base; la configuración de la instancia y las demás bases no se tocan.

- **`users`**: Administradores, maestros y alumnos (`id` entero autoincremental, `name`, `email`, `role: admin | teacher | student`, `password_hash`).
- **`groups`**: Grupos de cada maestro (`id`, `teacher_id`, `name`, `join_code`); los alumnos se unen escribiendo la clave `join_code`.
- **`group_students`**: Pertenencia de alumnos a grupos (`group_id`, `student_id`); un alumno puede estar en grupos de varios maestros.
- **`assignments`**: Tareas creadas por docentes para un grupo (`id`, `teacher_id`, `group_id`, `title`, `description`, `rubric`, `due_date`, `min_words`); el maestro puede editarlas desde la plataforma.
- **`assignment_documents`**: Archivos y PDFs asociados a la tarea (`id`, `assignment_id`, `file_name`, `gcs_uri`, `summary`, `content_snippet`).
- **`student_essays`**: Progreso, entrega y calificación (`id`, `assignment_id`, `student_id`, `title`, `content`, `outline`, `status: draft | submitted | graded`, `last_saved_at`, `submitted_at`, `grade`, `feedback`, `graded_at`).
- Tablas de sesiones del chat (`sessions`, `events`, `app_states`, `user_states`, `adk_internal_metadata`): las crea `DatabaseSessionService` de ADK al arrancar en Cloud Run.

Las migraciones están en `migrations/` y se aplican con una verificación de la base de destino:

```bash
uv run python -m db.apply_migration migrations/005_groups_and_admin.sql --expect-db sharon_education
uv run python -m db.seed_data   # crea la cuenta admin@gmail.com y el grupo 5°B de ejemplo
```

La 005 convierte a cada maestro existente en dueño de un grupo con su antiguo `group_name`, sus alumnos y todas sus tareas, y elimina `teacher_students` y `users.group_name`. `005_groups_and_admin.down.sql` la revierte (un maestro con varios grupos queda con uno solo).

---

## ⚙️ Configuración y Variables de Entorno

Copia el archivo `.env.example` a `.env`:

```bash
cp .env.example .env
```

Configura las variables según tu entorno:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `GEMINI_API_KEY` | Llave API de Google AI Studio (para pruebas rápidas) | `AIzaSy...` |
| `GOOGLE_GENAI_USE_VERTEXAI` | Habilitar Vertex AI en GCP | `False` o `True` |
| `GOOGLE_CLOUD_PROJECT` | ID del proyecto en Google Cloud | `tu-proyecto-gcp` |
| `DATABASE_URL` | URL de conexión a PostgreSQL (obligatoria, salvo en Cloud Run, que usa `INSTANCE_CONNECTION_NAME` y `DB_PASS`) | `postgresql+psycopg2://usuario:password@127.0.0.1:5432/sharon_education` |
| `GCS_BUCKET_NAME` | Bucket de Cloud Storage para almacenar los PDFs de las tareas | `sharon_storage` |
| `DATA_STORE_ID` | Identificador del Data Store de Vertex AI Search | `essay-tutor-datastore` |

---

## 🚀 Puesta en Marcha

### 1. Instalar dependencias con `uv`
```bash
cd backend
uv sync
```

### 2. Inicializar la Base de Datos y Sembrar Datos de Prueba
Ejecuta el script que crea las tablas relacionales e inserta la tarea muestra de la **Segunda Guerra Mundial**:
```bash
uv run python -m db.seed_data
```
Es idempotente: solo inserta lo que falta. No siembra lecturas: el maestro sube los PDFs desde la plataforma (están en `resources/<tarea>/`). Esto precarga:
- El administrador (`admin@gmail.com`, contraseña `1234`), que solo gestiona maestros.
- El profesor **Prof. Roberto Ramírez** (`teacher@gmail.com`, contraseña `1234`) con dos grupos: 5°A con seis alumnos, entre ellos **Carlos Gómez** (`user@gmail.com`, contraseña `1234`), y 5°B con dos.
- Cuatro tareas de ensayo en 5°A, con borradores, entregas y calificaciones de ejemplo.

### 3. Ejecutar Pruebas Automatizadas
```bash
make test   # levanta un PostgreSQL desechable (scripts/test_postgres.sh), corre las pruebas y lo borra
```

Necesita PostgreSQL instalado localmente (`brew install postgresql@18`); si `initdb` no está en el `PATH`, indica la carpeta con `PG_BIN`. Las pruebas se niegan a correr si la base de `DATABASE_URL` no tiene «test» en el nombre, porque borran y modifican datos.

### 4. Levantar la API para el frontend

La app FastAPI (`essay_tutor/fast_api_app.py`, generada con `agents-cli`) sirve la API REST de `api/` y el chat con Sharon. Para usar la base real desde tu máquina, abre el Cloud SQL Auth Proxy y apunta `DATABASE_URL` a él:

```bash
cloud-sql-proxy tlanova:us-central1:tlanovadb --port 5433
DATABASE_URL=postgresql+psycopg2://tlanovauser:<password>@127.0.0.1:5433/sharon_education \
  GOOGLE_GENAI_USE_VERTEXAI=True GOOGLE_CLOUD_PROJECT=tlanova GOOGLE_CLOUD_LOCATION=global \
  uv run uvicorn essay_tutor.fast_api_app:app --port 8080
```

Localmente también quedan disponibles las rutas nativas de ADK y el dev UI (`agents-cli playground`). En Cloud Run se bloquean, porque no tienen autenticación; solo se expone `/api` (el chequeo de salud es `/api/health`).

### 5. Lecturas en PDF (Cloud Storage + Vertex AI Search)

Los maestros suben PDFs a cada tarea desde el frontend (`POST /api/teacher/assignments/{id}/documents`). `services/documents.py`:

1. Extrae el texto con `pypdf` y lo guarda en `assignment_documents.content_snippet` (respaldo de búsqueda local).
2. Sube el archivo a `gs://sharon_storage/assignments/<id>/`.
3. Genera un resumen breve con Gemini.
4. Lo importa en el data store `essay-tutor-datastore` con el metadato `assignment_id`, para que cada búsqueda se filtre a su tarea. Discovery Engine divide e indexa el PDF (tarda unos minutos); mientras tanto el documento aparece como «Indexando…».

La herramienta `search_assignment_documents` busca en modo `CHUNKS` con el filtro `assignment_id: ANY("<id>")` y devuelve los fragmentos con su página. Si Vertex AI Search no está configurado o falla, busca en el texto extraído de los PDFs que se guarda en PostgreSQL.

Preparación, una sola vez (ya hecha en `tlanova`):

```bash
gcloud services enable discoveryengine.googleapis.com --project tlanova
GOOGLE_CLOUD_QUOTA_PROJECT=tlanova uv run python -m services.search_setup   # crea el data store (idempotente)
gcloud storage buckets add-iam-policy-binding gs://sharon_storage \
  --member serviceAccount:service-245061697924@gcp-sa-discoveryengine.iam.gserviceaccount.com --role roles/storage.objectViewer
```

Para cargar PDFs desde la terminal (con el proxy de Cloud SQL abierto): `uv run python -m services.documents --assignment 1 ../resources/segunda-guerra-mundial/*.pdf`. Localmente, Discovery Engine exige `GOOGLE_CLOUD_QUOTA_PROJECT=tlanova` al usar credenciales de usuario.

### 6. Desplegar en Cloud Run

```bash
make deploy   # corre los tests y despliega el servicio sharon-api
make url      # URL del servicio
make logs     # últimos logs
```

`make deploy` usa el comando que genera `agents-cli deploy --dry-run`, sin copiar el `.env` local: la contraseña de la base (`sharon-db-password`) y la llave de los JWT (`sharon-jwt-secret`) salen de Secret Manager. No uses `agents-cli deploy` directamente en este proyecto, porque propaga el `.env` completo como variables de entorno. El servicio corre con la cuenta `sharon-api-run@tlanova.iam.gserviceaccount.com` y con máximo una instancia, para no acaparar conexiones de la instancia compartida.

---

## 🛠️ Herramientas Integradas (ADK Tools)

1. **`get_assignment_details(assignment_id)`**: Consulta instrucciones, rúbrica y lista de documentos adjuntos por el docente.
2. **`search_assignment_documents(assignment_id, query)`**: Realiza búsqueda semántica en los documentos subidos por el maestro (RAG con Vertex AI Search o fallback local).
3. **`get_student_draft(student_id, assignment_id)`**: Recupera el texto, título y esquema del ensayo del alumno.
4. **`save_student_draft(student_id, assignment_id, title, content, outline)`**: Persiste el avance en PostgreSQL.
5. **`submit_student_essay(student_id, assignment_id)`**: Bloquea y formaliza la entrega final del ensayo.
