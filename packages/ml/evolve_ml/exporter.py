import json
import sqlite3
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from evolve_ml.config import ExportConfig


@dataclass
class RawInteraction:
    """Represents an exported interaction candidate for dataset preparation."""

    session_id: str
    prompt: str
    response: str
    is_technically_correct: bool = True
    rating: int | None = 1
    correction: str | None = None
    critique: str | None = None
    turns: list[dict[str, str]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


class SQLiteInteractionExporter:
    """Exports and filters interaction histories from Evolve's SQLite database."""

    def __init__(self, config: ExportConfig | None = None) -> None:
        self.config = config or ExportConfig()

    def _connect(self, db_path: str | Path) -> sqlite3.Connection:
        path = Path(db_path)
        if not path.exists():
            raise FileNotFoundError(f"Evolve database not found at: {path}")
        conn = sqlite3.connect(str(path))
        conn.row_factory = sqlite3.Row
        return conn

    def export_raw(self, db_path: str | Path | None = None) -> list[RawInteraction]:
        target_path = Path(db_path or self.config.db_path)
        if not target_path.exists():
            return []

        conn = self._connect(target_path)
        try:
            return self._extract_interactions(conn)
        finally:
            conn.close()

    def _extract_interactions(self, conn: sqlite3.Connection) -> list[RawInteraction]:
        results: list[RawInteraction] = []

        # 1. Query training_examples table if populated by feedback service
        has_training_examples = self._table_exists(conn, "training_examples")
        if has_training_examples:
            query = """
                SELECT te.id, te.session_id, te.prompt, te.response, te.critique,
                       te.is_successful, te.metadata,
                       f.rating, f.correction, f.is_technically_correct
                FROM training_examples te
                LEFT JOIN feedback f ON te.session_id = f.session_id
                ORDER BY te.created_at ASC
            """
            cursor = conn.execute(query)
            for row in cursor.fetchall():
                is_technically_correct = bool(row["is_technically_correct"]) if row["is_technically_correct"] is not None else bool(row["is_successful"])
                rating = row["rating"]
                correction = row["correction"]

                # Invariant: Never train directly on unreviewed external model outputs
                if self.config.require_technical_verification and not is_technically_correct:
                    # If not technically verified, only accept if human provided explicit written correction
                    if not (self.config.include_written_corrections and correction and correction.strip()):
                        continue

                meta = {}
                if row["metadata"]:
                    try:
                        meta = json.loads(row["metadata"])
                    except Exception:
                        pass

                results.append(
                    RawInteraction(
                        session_id=row["session_id"] or f"te_{row['id']}",
                        prompt=row["prompt"],
                        response=row["response"],
                        is_technically_correct=is_technically_correct,
                        rating=rating,
                        correction=correction,
                        critique=row["critique"],
                        turns=[
                            {"role": "user", "content": row["prompt"]},
                            {"role": "assistant", "content": row["response"]},
                        ],
                        metadata=meta,
                    )
                )

        # 2. Query sessions + events + feedback if training_examples was empty or to complement
        if not results and self._table_exists(conn, "sessions") and self._table_exists(conn, "events"):
            session_query = """
                SELECT s.id as session_id, s.goal,
                       f.rating, f.correction, f.is_technically_correct, f.notes
                FROM sessions s
                LEFT JOIN feedback f ON s.id = f.session_id
                WHERE s.status IN ('completed', 'active')
            """
            cursor = conn.execute(session_query)
            for srow in cursor.fetchall():
                sid = srow["session_id"]
                rating = srow["rating"]
                correction = srow["correction"]
                tech_correct = bool(srow["is_technically_correct"]) if srow["is_technically_correct"] is not None else False

                if self.config.require_technical_verification and not tech_correct:
                    if not (self.config.include_written_corrections and correction and correction.strip()):
                        continue

                # Fetch events for this session in timestamp order
                ev_query = """
                    SELECT type, payload, timestamp
                    FROM events
                    WHERE session_id = ?
                    ORDER BY timestamp ASC
                """
                ev_cursor = conn.execute(ev_query, (sid,))
                turns: list[dict[str, str]] = []
                user_prompt = srow["goal"]
                assistant_response = ""

                for erow in ev_cursor.fetchall():
                    ev_type = erow["type"]
                    try:
                        payload = json.loads(erow["payload"])
                    except Exception:
                        continue

                    if ev_type == "user_prompt":
                        prompt_text = payload.get("prompt") or payload.get("text", "")
                        if prompt_text:
                            user_prompt = prompt_text
                            turns.append({"role": "user", "content": prompt_text})
                    elif ev_type == "assistant_response":
                        resp_text = payload.get("response") or payload.get("content", "")
                        if resp_text:
                            assistant_response = resp_text
                            turns.append({"role": "assistant", "content": resp_text})

                if user_prompt and (assistant_response or correction):
                    results.append(
                        RawInteraction(
                            session_id=sid,
                            prompt=user_prompt,
                            response=assistant_response or (correction or ""),
                            is_technically_correct=tech_correct,
                            rating=rating,
                            correction=correction,
                            critique=srow["notes"],
                            turns=turns or [
                                {"role": "user", "content": user_prompt},
                                {"role": "assistant", "content": assistant_response or correction or ""},
                            ],
                            metadata={"session_id": sid},
                        )
                    )

        return results

    def _table_exists(self, conn: sqlite3.Connection, table_name: str) -> bool:
        cursor = conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,),
        )
        return cursor.fetchone()[0] > 0

    def export_to_jsonl(self, output_path: str | Path, db_path: str | Path | None = None) -> int:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        interactions = self.export_raw(db_path)
        with open(out, "w", encoding="utf-8") as f:
            for item in interactions:
                f.write(json.dumps(asdict(item), ensure_ascii=False) + "\n")
        return len(interactions)
