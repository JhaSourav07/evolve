from pathlib import Path

from evolve_ml.config import PreprocessingConfig
from evolve_ml.exporter import RawInteraction
from evolve_ml.preprocessing import DatasetPreprocessor


def test_preprocessor_secret_redaction_and_dedup():
    preprocessor = DatasetPreprocessor(PreprocessingConfig(redact_secrets=True, deduplicate=True))
    raw = [
        RawInteraction(
            session_id="s1",
            prompt="API key sk-1234567890abcdefghijklmnopqrstuv",
            response="def fetch(): pass",
        ),
        # Duplicate of previous
        RawInteraction(
            session_id="s2",
            prompt="API key sk-1234567890abcdefghijklmnopqrstuv",
            response="def fetch(): pass",
        ),
        # Empty prompt (must be skipped)
        RawInteraction(
            session_id="s3",
            prompt="",
            response="def invalid(): pass",
        ),
    ]

    processed, stats = preprocessor.process_raw(raw)
    assert stats["total_raw"] == 3
    assert stats["valid_processed"] == 1
    assert stats["duplicates_removed"] == 1
    assert stats["invalid_skipped"] == 1
    assert "[REDACTED_SECRET]" in processed[0].prompt


def test_preprocessor_disjoint_train_val_split():
    preprocessor = DatasetPreprocessor(PreprocessingConfig(train_ratio=0.75, random_seed=42))
    raw = [
        RawInteraction(session_id=f"sess_{i}", prompt=f"Task {i}", response=f"Code {i}")
        for i in range(10)
    ]
    processed, _ = preprocessor.process_raw(raw)
    train, val = preprocessor.split_train_val(processed)

    assert len(train) > 0
    assert len(val) > 0
    assert len(train) + len(val) == 10

    train_sessions = {ex.session_id for ex in train}
    val_sessions = {ex.session_id for ex in val}

    # Strict disjointness requirement
    assert train_sessions.isdisjoint(val_sessions)


def test_preprocessor_save_splits(tmp_path: Path):
    preprocessor = DatasetPreprocessor()
    raw = [
        RawInteraction(session_id=f"sess_{i}", prompt=f"Task {i}", response=f"Code {i}")
        for i in range(4)
    ]
    processed, _ = preprocessor.process_raw(raw)
    train, val = preprocessor.split_train_val(processed)
    train_path, val_path = preprocessor.save_splits(train, val, tmp_path)

    assert train_path.exists()
    assert val_path.exists()
