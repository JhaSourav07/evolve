from pathlib import Path

from evolve_ml.preprocessing import ProcessedExample
from evolve_ml.sft import SFTDatasetGenerator


def test_sft_generator_chatml():
    generator = SFTDatasetGenerator(system_prompt="You are Evolve.")
    example = ProcessedExample(
        id="ex_1",
        session_id="s1",
        prompt="Write a function to reverse a string",
        response="def rev(s: str) -> str: return s[::-1]",
    )

    records = generator.generate([example])
    assert len(records) == 1
    rec = records[0]
    assert rec["session_id"] == "s1"
    messages = rec["messages"]
    assert len(messages) == 3
    assert messages[0] == {"role": "system", "content": "You are Evolve."}
    assert messages[1] == {"role": "user", "content": "Write a function to reverse a string"}
    assert messages[2] == {"role": "assistant", "content": "def rev(s: str) -> str: return s[::-1]"}


def test_sft_generator_validation():
    generator = SFTDatasetGenerator()
    valid_rec = {
        "messages": [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "user"},
            {"role": "assistant", "content": "assistant"},
        ]
    }
    assert generator.validate_record(valid_rec) is True

    # Missing assistant
    invalid_rec = {
        "messages": [
            {"role": "user", "content": "user"},
        ]
    }
    assert generator.validate_record(invalid_rec) is False

    # Empty content
    invalid_empty = {
        "messages": [
            {"role": "user", "content": "  "},
            {"role": "assistant", "content": "code"},
        ]
    }
    assert generator.validate_record(invalid_empty) is False
