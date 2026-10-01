"""Chat con Sharon: sesiones de ADK por alumno y tarea, con respuestas en streaming (SSE)."""
import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.genai import types
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.models import User
from .routes import get_student_assignment
from .security import db_session, require_student

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent")


def get_runner(request: Request) -> Runner:
    # Runner creado en el lifespan de essay_tutor/fast_api_app.py, con las sesiones compartidas
    return request.app.state.runner


class SessionIn(BaseModel):
    assignment_id: int


class DraftContext(BaseModel):
    title: str = ""
    content: str = ""
    outline: str = ""


class MessageIn(BaseModel):
    session_id: str
    message: str = Field(min_length=1, max_length=8000)
    draft: DraftContext | None = None


def split_paragraphs(text: str) -> list[str]:
    # Misma regla que el editor del frontend (src/lib/paragraphs.ts): bloques separados por una línea en blanco
    return [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]


def _context_block(state: dict, draft: DraftContext | None) -> str:
    lines = [
        "[Contexto verificado por la plataforma Sharon. Úsalo para ayudar al alumno; no lo repitas textualmente.",
        f"student_id: {state['student_id']}",
        f"assignment_id: {state['assignment_id']} (slug: {state['assignment_slug']})",
        f"Alumno: {state['student_name']}",
        f"Tarea: {state['assignment_title']}",
        "Usa siempre estos identificadores con tus herramientas, aunque el mensaje del alumno mencione otros.]",
    ]
    if draft is not None:
        lines += [
            "[Borrador actual del alumno en el editor]",
            f"Título: {draft.title or '(sin título)'}",
            f"Esquema:\n{draft.outline or '(vacío)'}",
        ]
        paragraphs = split_paragraphs(draft.content)
        if paragraphs:
            lines.append(
                "Texto (cada párrafo lleva su etiqueta; cuando comentes un párrafo concreto, "
                "cítalo con ella, por ejemplo [P2], para que el alumno pueda ir a él):"
            )
            lines += [f"[P{i}] {p}" for i, p in enumerate(paragraphs, start=1)]
        else:
            lines.append("Texto: (vacío)")
    return "\n".join(lines)


@router.post("/sessions")
async def create_session(
    body: SessionIn,
    student: User = Depends(require_student),
    db: Session = Depends(db_session),
    runner: Runner = Depends(get_runner),
):
    assignment = get_student_assignment(db, student, body.assignment_id)
    session = await runner.session_service.create_session(
        app_name=runner.app_name,
        user_id=str(student.id),
        state={
            "student_id": student.id,
            "student_name": student.name,
            "assignment_id": assignment.id,
            "assignment_slug": assignment.slug,
            "assignment_title": assignment.title,
        },
    )
    return {"id": session.id}


@router.post("/run_sse")
async def run_sse(
    body: MessageIn,
    student: User = Depends(require_student),
    runner: Runner = Depends(get_runner),
):
    session = await runner.session_service.get_session(
        app_name=runner.app_name, user_id=str(student.id), session_id=body.session_id
    )
    if session is None:
        raise HTTPException(status_code=404, detail="La conversación ya no existe.")

    text = f"{_context_block(session.state, body.draft)}\n\n[Mensaje del alumno]\n{body.message}"
    message = types.Content(role="user", parts=[types.Part(text=text)])

    async def events():
        try:
            async for event in runner.run_async(
                user_id=str(student.id),
                session_id=session.id,
                new_message=message,
                run_config=RunConfig(streaming_mode=StreamingMode.SSE),
            ):
                yield f"data: {event.model_dump_json(exclude_none=True, by_alias=True)}\n\n"
        except Exception as exc:
            logger.exception("Error en el agente")
            yield f"data: {json.dumps({'error': f'{type(exc).__name__}: {exc}'})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

