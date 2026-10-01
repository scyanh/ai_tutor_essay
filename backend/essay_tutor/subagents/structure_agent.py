"""Subagente especialista en estructura, planteamiento de tesis y coherencia argumentativa."""
import os
from google.adk.agents import Agent
from google.adk.models import Gemini
from google.genai import types

from essay_tutor.prompts import STRUCTURE_AGENT_INSTRUCTION
from essay_tutor.tools import get_assignment_details

MODEL = os.getenv("MODEL_NAME", "gemini-3.8-flash")

structure_specialist = Agent(
    name="structure_specialist",
    model=Gemini(
        model=MODEL,
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=STRUCTURE_AGENT_INSTRUCTION,
    description="Subagente que guía la arquitectura del ensayo: formulación de tesis, esquema de párrafos, desarrollo argumentativo CER y conclusión contra la rúbrica.",
    tools=[get_assignment_details],
)
