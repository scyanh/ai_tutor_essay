"""Subagente especialista en estilo, gramática y registro formal académico."""
import os
from google.adk.agents import Agent
from google.adk.models import Gemini
from google.genai import types

from essay_tutor.prompts import STYLE_AGENT_INSTRUCTION

MODEL = os.getenv("MODEL_NAME", "gemini-3.8-flash")

style_coach = Agent(
    name="style_coach",
    model=Gemini(
        model=MODEL,
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=STYLE_AGENT_INSTRUCTION,
    description="Subagente que orienta sobre redacción académica, conectores discursivos, enriquecimiento de vocabulario, sintaxis y ortografía.",
    tools=[],
)
