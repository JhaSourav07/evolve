import sqlite3
from pathlib import Path

import pytest
from evolve_ml.config import ExportConfig, PreprocessingConfig, TrainingConfig
from evolve_ml.pipeline import EvolveMLPipeline


@pytest.fixture
def mock_db(tmp_path: Path) -> Path:
    db_file = tmp_path / "evolve_pipeline.db"
    conn = sqlite3.connect(str(db_file))
    conn.execute("""
        CREATE TABLE training_examples (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            prompt TEXT NOT NULL,
            response TEXT NOT NULL,
            critique TEXT,
            is_successful INTEGER NOT NULL,
            metadata TEXT,
            created_at INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE feedback (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            tool_call_id TEXT,
            target_type TEXT NOT NULL,
            type TEXT NOT NULL,
            rating INTEGER,
            notes TEXT,
            correction TEXT,
            is_technically_correct INTEGER,
            metadata TEXT,
            created_at INTEGER NOT NULL
        )
    """)

    # Populate 3 sessions
    for i in range(1, 4):
        conn.execute(
            "INSERT INTO training_examples VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (f"te_{i}", f"sess_{i}", f"Task {i}", f"def func_{i}(): pass", None, 1, None, i * 1000),
        )
        conn.execute(
            "INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (f"fb_{i}", f"sess_{i}", None, "response", "human", 1, "Good", f"def func_{i}_corrected(): pass" if i == 1 else None, 1, None, i * 1000),
        )

    conn.commit()
    conn.close()
    return db_file


def test_pipeline_end_to_end(mock_db: Path, tmp_path: Path):
    processed_dir = tmp_path / "processed"
    output_dir = tmp_path / "adapter"

    pipeline = EvolveMLPipeline(
        export_config=ExportConfig(db_path=str(mock_db)),
        preprocessing_config=PreprocessingConfig(processed_dir=str(processed_dir), train_ratio=0.66),
        training_config=TrainingConfig(output_dir=str(output_dir)),
    )

    results = pipeline.run(db_path=mock_db, dry_run=True)

    assert results["stats"]["valid_processed"] == 3
    assert results["train_samples"] > 0
    assert results["val_samples"] > 0
    assert results["dpo_samples"] == 1  # 1 correction provided
    assert results["baseline_metrics"]["num_samples"] > 0
    assert results["training_result"]["status"] == "completed_dry_run"

    # Verify artifacts on disk
    assert (processed_dir / "sft_train.jsonl").exists()
    assert (processed_dir / "sft_val.jsonl").exists()
    assert (processed_dir / "dpo_pairs.jsonl").exists()
    assert (output_dir / "adapter_config.json").exists()
