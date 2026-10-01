"""Subagente especialista en investigación y consulta de documentos del maestro (RAG)."""
import os
from google.adk.agents import Agent
from google.adk.models import Gemini
from google.genai import types

from essay_tutor.prompts import RESEARCH_AGENT_INSTRUCTION
from essay_tutor.tools import search_assignment_documents

MODEL = os.getenv("MODEL_NAME", "gemini-3.8-flash")

research_specialist = Agent(
    name="research_specialist",
    model=Gemini(
        model=MODEL,
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=RESEARCH_AGENT_INSTRUCTION,
    description="Subagente que investiga y extrae hechos, fechas, citas y datos de los PDFs subidos por el maestro en Cloud Storage e indexados en Vertex AI Search.",
    tools=[search_assignment_documents],
)
