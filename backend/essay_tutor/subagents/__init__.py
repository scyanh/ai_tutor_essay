"""Subagentes especializados para el sistema de tutoría de ensayos."""
from .research_agent import research_specialist
from .structure_agent import structure_specialist
from .style_agent import style_coach

__all__ = ["research_specialist", "structure_specialist", "style_coach"]
