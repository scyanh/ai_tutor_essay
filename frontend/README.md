# Frontend - Sharon (React)

Interfaz web de Sharon para maestros y alumnos de preparatoria. Construida con **Vite + React 19 + TypeScript + Tailwind CSS v4** y conectada a la API del backend (`backend/`).

## Funcionalidades

**Administrador**
- Alta, edición (nombre, correo, contraseña) y baja de maestros. Es lo único que gestiona.

**Maestro**
- Inicio con sus grupos: crear, renombrar y eliminar grupos. Cada grupo tiene una clave de 8 caracteres que el maestro comparte (y puede regenerar) para que los alumnos se unan.
- Página del grupo con su clave y las tarjetas de Alumnos y Tareas.
- Alumnos del grupo: buscar, ver entregas de cada alumno, moverlo a otro grupo o quitarlo del grupo.
- Tareas del grupo filtrables por fecha de publicación (últimos 7 días, 30 días, 6 meses o todas), con métricas del grupo (alumnos, tareas activas, ensayos por calificar y promedio).
- Tarjetas por tarea con el avance del grupo (calificados, entregados, en progreso, sin iniciar).
- Matriz de alumnos × ensayos con estado, porcentaje de avance y calificación.
- Detalle de cada tarea con el progreso por alumno (palabras escritas contra la meta).
- Revisión del ensayo en formato de lectura y calificación de 0 a 10 con retroalimentación.
- Creación de nuevas tareas (título, instrucciones, rúbrica, fecha límite y extensión mínima).
- Lecturas de referencia en PDF por tarea: se suben arrastrando o con un botón, se guardan en Cloud Storage y se indexan en Vertex AI Search para que Sharon cite de ellas. El panel muestra el estado de indexación.

**Alumno**
- Registro propio con nombre, correo y contraseña (`/registro`). Mientras no pertenezca a un grupo, su inicio le pide la clave del grupo; después puede unirse a más grupos.
- Lista de ensayos pendientes con fecha límite y avance, y lista de entregados con su calificación.
- Editor de ensayo con título, texto y pestaña de esquema y notas.
- Acceso a las lecturas de la tarea en PDF desde el panel de instrucciones.
- Guardado automático mientras escribe (además de `⌘/Ctrl + S`), con indicador de estado.
- Chat con Sharon (el agente ADK del backend) con respuestas en streaming. Sharon recibe el borrador actual del editor como contexto.
- Envío formal del ensayo con lista de verificación. Una vez enviado queda bloqueado hasta que el maestro lo califica.

## Puesta en marcha

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Abre `http://localhost:5173`.

### Cuentas de prueba

Vienen del seed del backend (`backend/db/seed_data.py`), guardado en la base `sharon_education`:

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin@gmail.com` | `1234` |
| Maestro | `teacher@gmail.com` | `1234` |
| Alumno | `user@gmail.com` | `1234` |

El maestro tiene dos grupos: «Historia Universal · 5°A» y «Historia Universal · 5°B». Los demás alumnos usan `<nombre>@alumnos.prepa.edu.mx` con contraseña `1234`. En `npm run dev` la pantalla de login muestra botones para llenar estas cuentas; en el build de producción no aparecen.

## Configuración (`.env`)

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `VITE_API_TARGET` | Backend al que el proxy de Vite reenvía `/api`: local (`http://localhost:8080`) o la URL de Cloud Run del servicio `sharon-api` | `http://localhost:8080` |

El proxy quita la cabecera `Origin`, porque el backend (FastAPI de ADK) rechaza con 403 los orígenes que no estén en `ALLOW_ORIGINS`. Si sirves el frontend compilado desde otro dominio, agrega ese origen a `ALLOW_ORIGINS` en el servicio de Cloud Run.

## Despliegue

El frontend está publicado en Firebase Hosting, en el sitio `tlanova-sharon` del proyecto `tlanova`: https://tlanova-sharon.web.app

```bash
make deploy   # npm ci, build de producción y firebase deploy --only hosting
```

El build de producción usa `.env.production`: el navegador llama directo a `sharon-api` en Cloud Run (`VITE_API_BASE`), sin pasar por Firebase, para que el chat con Sharon conserve el streaming. Por eso el origen del sitio está en `ALLOW_ORIGINS` del backend (`backend/Makefile`); si cambias de dominio, actualízalo ahí y vuelve a desplegar el backend.

## API del backend

Todas las rutas, salvo el login y el registro, requieren `Authorization: Bearer <token>`. Los errores devuelven `{ "detail": "mensaje" }`. Los tipos están en `src/api/types.ts` y el cliente en `src/api/httpApi.ts` y `src/api/agent.ts`.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` | `{ token, user }` |
| POST | `/api/auth/register` | `{ name, email, password }` | `{ token, user }` (crea un alumno) |
| GET | `/api/auth/me` | | `User` |
| GET | `/api/teacher/groups` | | `GroupSummary[]` |
| POST | `/api/teacher/groups` | `{ name }` | `GroupSummary` |
| PATCH | `/api/teacher/groups/{id}` | `{ name }` | `GroupSummary` |
| DELETE | `/api/teacher/groups/{id}` | | `204` (borra sus tareas, lecturas y entregas) |
| POST | `/api/teacher/groups/{id}/join-code` | | `GroupSummary` con una clave nueva |
| GET | `/api/teacher/groups/{id}` | | `{ group, students, assignments, essays }` |
| DELETE | `/api/teacher/groups/{id}/students/{studentId}` | | `204` |
| POST | `/api/teacher/groups/{id}/students/{studentId}/move` | `{ group_id }` | `204` |
| GET | `/api/teacher/assignments/{id}` | | `{ group, assignment, students, former_students, essays }` |
| POST | `/api/teacher/assignments` | `{ group_id, title, description, rubric, due_date, min_words }` | `Assignment` |
| GET | `/api/teacher/assignments/{id}/essays/{studentId}` | | `{ group, assignment, student, essay }` |
| POST | `/api/teacher/essays/{essayId}/grade` | `{ grade, feedback }` | `Essay` |
| GET | `/api/student/groups` | | `StudentGroup[]` |
| POST | `/api/student/groups/join` | `{ code }` | `StudentGroup` |
| GET | `/api/student/assignments` | | `[{ assignment, teacher, group, essay }]` |
| GET | `/api/student/assignments/{id}` | | `{ assignment, teacher, group, essay }` |
| PUT | `/api/student/assignments/{id}/essay` | `{ title, content, outline }` | `Essay` |
| POST | `/api/student/assignments/{id}/submit` | | `Essay` |
| GET | `/api/teacher/assignments/{id}/documents` | | `AssignmentDocument[]` (actualiza el estado de indexación) |
| POST | `/api/teacher/assignments/{id}/documents` | `multipart/form-data` con uno o más `files` (PDF, hasta 20 MB) | `AssignmentDocument[]` |
| DELETE | `/api/teacher/documents/{documentId}` | | `204` |
| GET | `/api/documents/{documentId}/file` | | El PDF (maestro de la tarea o alumno de su grupo) |
| GET | `/api/admin/teachers` | | `AdminTeacher[]` |
| POST | `/api/admin/teachers` | `{ name, email, password }` | `AdminTeacher` |
| PATCH | `/api/admin/teachers/{id}` | `{ name?, email?, password? }` | `AdminTeacher` |
| DELETE | `/api/admin/teachers/{id}` | | `204` (borra sus grupos y tareas) |
| POST | `/api/agent/sessions` | `{ assignment_id }` | `{ id }` |
| POST | `/api/agent/run_sse` | `{ session_id, message, draft }` | Eventos de ADK en SSE |

En el chat, el servidor antepone a cada mensaje el `student_id` y el `assignment_id` verificados con el token, así que Sharon usa siempre los identificadores del alumno que inició sesión. El frontend manda el borrador del editor (`draft`) solo cuando cambió desde el mensaje anterior.

## Estructura

```text
src/
├── api/           # Tipos, cliente REST y cliente del chat con Sharon
├── auth/          # Contexto de sesión
├── components/    # UI compartida, layout, chat con Sharon
├── lib/           # Formato de fechas, progreso, autoguardado
└── pages/
    ├── LoginPage.tsx
    ├── teacher/   # Panel, detalle de tarea y calificación
    └── student/   # Mis tareas y editor de ensayo
```
