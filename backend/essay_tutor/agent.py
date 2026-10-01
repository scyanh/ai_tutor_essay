"""Agente orquestador principal (root_agent) para el Tutor de Ensayos ADK."""
import os
from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.genai import types

from essay_tutor.prompts import ORCHESTRATOR_INSTRUCTION
from essay_tutor.tools import (
    get_assignment_details,
    get_student_draft,
    save_student_draft,
    submit_student_essay,
    search_assignment_documents,
)
from essay_tutor.subagents import (
    research_specialist,
    structure_specialist,
    style_coach,
)

load_dotenv()

MODEL = os.getenv("MODEL_NAME", "gemini-3.8-flash")

# Orquestador del tutor de ensayos
root_agent = Agent(
    name="essay_tutor",
    model=Gemini(
        model=MODEL,
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=ORCHESTRATOR_INSTRUCTION,
    description="Tutora socrática e inteligente para guiar a estudiantes en la escritura de ensayos académicos.",
    tools=[
        get_assignment_details,
        get_student_draft,
        save_student_draft,
        submit_student_essay,
        search_assignment_documents,
    ],
    sub_agents=[
        research_specialist,
        structure_specialist,
        style_coach,
    ],
)

app = App(
    root_agent=root_agent,
    name="essay_tutor_app",
)
