"""La numeración de párrafos del contexto del chat debe coincidir con la del editor del frontend."""
from api.agent_routes import DraftContext, _context_block, split_paragraphs

STATE = {
    "student_id": 2, "student_name": "Carlos", "assignment_id": 1,
    "assignment_slug": "segunda-guerra-mundial", "assignment_title": "Ensayo",
}


def test_split_paragraphs_ignores_blank_blocks():
    text = "Primer párrafo.\nSigue igual.\n\n\n  Segundo párrafo.  \n \n\nTercero."
    assert split_paragraphs(text) == ["Primer párrafo.\nSigue igual.", "Segundo párrafo.", "Tercero."]


def test_context_labels_each_paragraph():
    block = _context_block(STATE, DraftContext(title="T", content="Uno.\n\nDos.", outline=""))
    assert "[P1] Uno." in block
    assert "[P2] Dos." in block
    assert "[P3]" not in block
