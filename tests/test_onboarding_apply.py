"""Pure tests for onboarding answer validation + answer→memory mapping (F0.4)."""
from app.onboarding.questions import answer_to_write, validate_answer


def test_validate_rejects_unknown_key():
    assert validate_answer("favorite_food", "Pizza") == "Unbekannte Frage: favorite_food"


def test_validate_rejects_blank_value():
    assert validate_answer("coaching_style", "   ") == "Leere Antwort: coaching_style"


def test_validate_rejects_unknown_choice():
    err = validate_answer("coaching_style", "Brutal ehrlich")
    assert err is not None and "Ungültige Antwort" in err


def test_validate_accepts_valid_choice_and_free_text():
    assert validate_answer("coaching_style", "Ausgewogen") is None
    assert validate_answer("goals", "Q3-Launch schaffen") is None


def test_answer_to_write_parses_the_target():
    w = answer_to_write("coaching_style", " Ausgewogen ")
    assert (w.type, w.title, w.detail_kind) == ("comm_style", "Ausgewogen", "coaching_style")
    w = answer_to_write("goals", "Q3-Launch schaffen")
    assert (w.type, w.detail_kind) == ("pattern", "goal")


def test_answer_to_write_none_for_unknown_or_blank():
    assert answer_to_write("nope", "x") is None
    assert answer_to_write("goals", "  ") is None
