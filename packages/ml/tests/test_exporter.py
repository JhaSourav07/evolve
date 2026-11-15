import json
import sqlite3
from pathlib import Path

import pytest
from evolve_ml.config import ExportConfig
from evolve_ml.exporter import SQLiteInteractionExporter


@pytest.fixture
def mock_db(tmp_path: Path) -> Path:
    db_file = tmp_path / "evolve_test.db"
    conn = sqlite3.connect(str(db_file))

    # Create tables
    conn.execute("""
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            goal TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
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
        CREATE TABLE events (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        )
    """)

    # Populate records:
    # 1. Verified technically correct example
    conn.execute(
        "INSERT INTO training_examples VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("te_1", "sess_1", "Implement factorial", "def fact(n): return 1 if n <= 1 else n * fact(n-1)", None, 1, None, 1000),
    )
    conn.execute(
        "INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("fb_1", "sess_1", None, "response", "human", 1, "Good", None, 1, None, 1000),
    )

    # 2. Unverified / incorrect output WITHOUT human correction (MUST BE FILTERED OUT)
    conn.execute(
        "INSERT INTO training_examples VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("te_2", "sess_2", "Implement broken loop", "while True: pass", "Inf loop", 0, None, 2000),
    )
    conn.execute(
        "INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("fb_2", "sess_2", None, "response", "human", -1, "Infinite loop", None, 0, None, 2000),
    )

    # 3. Flawed output WITH human correction (MUST BE ACCEPTED via correction)
    conn.execute(
        "INSERT INTO training_examples VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("te_3", "sess_3", "Implement safe division", "def div(a, b): return a / b", "ZeroDivisionError", 0, None, 3000),
    )
    conn.execute(
        "INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("fb_3", "sess_3", None, "response", "human", 0, "Needs zero check", "def div(a, b): return a / b if b != 0 else 0", 0, None, 3000),
    )

    conn.commit()
    conn.close()
    return db_file


def test_exporter_filters_unreviewed_outputs(mock_db: Path):
    exporter = SQLiteInteractionExporter(
        ExportConfig(db_path=str(mock_db), require_technical_verification=True, include_written_corrections=True)
    )
    interactions = exporter.export_raw(mock_db)

    # sess_1 (verified correct) and sess_3 (has human correction) must pass.
    # sess_2 (unverified / technically incorrect with no correction) MUST be rejected.
    session_ids = [item.session_id for item in interactions]
    assert "sess_1" in session_ids
    assert "sess_3" in session_ids
    assert "sess_2" not in session_ids
    assert len(interactions) == 2


def test_exporter_jsonl_export(mock_db: Path, tmp_path: Path):
    out_file = tmp_path / "raw.jsonl"
    exporter = SQLiteInteractionExporter(ExportConfig(db_path=str(mock_db)))
    count = exporter.export_to_jsonl(out_file, mock_db)
    assert count == 2
    assert out_file.exists()

    with open(out_file, "r", encoding="utf-8") as f:
        lines = [json.loads(line) for line in f]
    assert len(lines) == 2
    assert lines[0]["prompt"] == "Implement factorial"
