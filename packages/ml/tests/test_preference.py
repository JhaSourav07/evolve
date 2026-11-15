from evolve_ml.preference import DPOPair, PreferenceDatasetGenerator
from evolve_ml.preprocessing import ProcessedExample


def test_preference_generator_from_examples():
    gen = PreferenceDatasetGenerator(redact_secrets=True)
    examples = [
        # Example with correction (becomes contrastive pair)
        ProcessedExample(
            id="ex_1",
            session_id="s1",
            prompt="Sort an array",
            response="def sort(arr): return arr.sort()",  # flawed (returns None)
            correction="def sort(arr): return sorted(arr)",  # corrected
        ),
        # Example without correction (should not generate a DPO pair)
        ProcessedExample(
            id="ex_2",
            session_id="s2",
            prompt="Hello",
            response="World",
            correction=None,
        ),
    ]

    pairs = gen.from_examples(examples)
    assert len(pairs) == 1
    pair = pairs[0]
    assert pair.session_id == "s1"
    assert pair.prompt == "Sort an array"
    assert pair.chosen == "def sort(arr): return sorted(arr)"
    assert pair.rejected == "def sort(arr): return arr.sort()"


def test_preference_pair_validation():
    # Valid
    p1 = DPOPair(id="1", session_id="s", prompt="p", chosen="c", rejected="r")
    assert PreferenceDatasetGenerator.validate_pair(p1) is True

    # Identical chosen and rejected
    p2 = DPOPair(id="2", session_id="s", prompt="p", chosen="c", rejected="c")
    assert PreferenceDatasetGenerator.validate_pair(p2) is False

    # Empty prompt
    p3 = DPOPair(id="3", session_id="s", prompt="", chosen="c", rejected="r")
    assert PreferenceDatasetGenerator.validate_pair(p3) is False
