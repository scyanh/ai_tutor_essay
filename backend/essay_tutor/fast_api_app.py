# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import contextlib
import os
from collections.abc import AsyncIterator

from a2a.server.tasks import InMemoryTaskStore
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.runners import Runner

from api.admin_routes import router as admin_router
from api.agent_routes import router as agent_router
from api.group_routes import router as group_router
from api.routes import router as api_router
from essay_tutor.app_utils import services
from essay_tutor.app_utils.a2a import attach_a2a_routes

load_dotenv()
allow_origins = (
    os.getenv("ALLOW_ORIGINS", "").split(",") if os.getenv("ALLOW_ORIGINS") else None
)
otel_to_cloud = True

AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    from essay_tutor.agent import app as adk_app
    from essay_tutor.agent import root_agent

    runner = Runner(
        app=adk_app,
        session_service=services.get_session_service(),
        artifact_service=services.get_artifact_service(),
        auto_create_session=True,
    )
    app.state.runner = runner
    app.state.agent_app_name = adk_app.name
    await attach_a2a_routes(
        app,
        agent=root_agent,
        runner=runner,
        task_store=InMemoryTaskStore(),
        rpc_path=f"/a2a/{adk_app.name}",
    )
    yield


app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    web=True,
    artifact_service_uri=services.ARTIFACT_SERVICE_URI,
    allow_origins=allow_origins,
    session_service_uri=services.SESSION_SERVICE_URI,
    otel_to_cloud=otel_to_cloud,
    lifespan=lifespan,
)
app.title = "sharon-api"
app.description = "API de Sharon: login, tareas, ensayos y chat con la tutora essay_tutor"

app.include_router(api_router)
app.include_router(group_router)
app.include_router(admin_router)
app.include_router(agent_router)

# Las rutas nativas de ADK/A2A y el dev UI no tienen autenticación: cualquiera podría
# conversar con el agente usando el student_id de otro alumno. En Cloud Run (K_SERVICE)
# solo se expone /api, salvo que EXPOSE_ADK_ROUTES=true.
expose_adk_routes = (
    os.getenv("EXPOSE_ADK_ROUTES", "false" if os.getenv("K_SERVICE") else "true").lower() == "true"
)


@app.middleware("http")
async def restrict_adk_routes(request: Request, call_next):
    path = request.url.path
    if not expose_adk_routes and not path.startswith("/api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return await call_next(request)


# Cloud Run reserva /healthz, por eso el chequeo vive bajo /api
@app.get("/api/health")
def health():
    return {"status": "ok"}


# Main execution
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
