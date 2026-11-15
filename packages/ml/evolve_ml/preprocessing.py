import json
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from evolve_ml.config import PreprocessingConfig
from evolve_ml.exporter import RawInteraction
from evolve_ml.filters import DeduplicationFilter, SecretFilter


@dataclass
class ProcessedExample:
    """A sanitized, validated interaction ready for SFT or preference formatting."""

    id: str
    session_id: str
    prompt: str
    response: str
    turns: list[dict[str, str]] = field(default_factory=list)
    rating: int | None = 1
    correction: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class DatasetPreprocessor:
    """Preprocesses raw interaction records: secret redaction, deduplication, validation, and session-based splitting."""

    def __init__(self, config: PreprocessingConfig | None = None) -> None:
        self.config = config or PreprocessingConfig()
        self.dedup = DeduplicationFilter()

    def process_raw(
        self, interactions: list[RawInteraction]
    ) -> tuple[list[ProcessedExample], dict[str, int]]:
        stats = {
            "total_raw": len(interactions),
            "redacted_secrets": 0,
            "duplicates_removed": 0,
            "invalid_skipped": 0,
            "valid_processed": 0,
        }
        processed: list[ProcessedExample] = []
        self.dedup.reset()

        for idx, item in enumerate(interactions):
            prompt = item.prompt or ""
            response = item.response or ""
            correction = item.correction.strip() if item.correction else None

            # Schema validation: non-empty prompt and response
            if not prompt.strip() or (not response.strip() and not correction):
                stats["invalid_skipped"] += 1
                continue

            # Secret redaction
            secrets_in_item = 0
            if self.config.redact_secrets:
                prompt, p_count = SecretFilter.redact(prompt)
                response, r_count = SecretFilter.redact(response)
                secrets_in_item = p_count + r_count
                if correction:
                    correction, c_count = SecretFilter.redact(correction)
                    secrets_in_item += c_count
                stats["redacted_secrets"] += secrets_in_item
            if self.config.redact_secrets:
                prompt, p_count = SecretFilter.redact(prompt)
                response, r_count = SecretFilter.redact(response)
                secrets_in_item = p_count + r_count
                stats["redacted_secrets"] += secrets_in_item

            # Deduplication
            if self.config.deduplicate and self.dedup.is_duplicate(prompt, response):
                stats["duplicates_removed"] += 1
                continue

            # Process conversational turns
            clean_turns: list[dict[str, str]] = []
            if item.turns:
                for turn in item.turns:
                    role = turn.get("role", "user")
                    content = turn.get("content", "")
                    if role not in ("system", "user", "assistant"):
                        role = "user"
                    if self.config.redact_secrets:
                        content, _ = SecretFilter.redact(content)
                    if content.strip():
                        clean_turns.append({"role": role, "content": content})

            if not clean_turns:
                clean_turns = [
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": response},
                ]

            example = ProcessedExample(
                id=f"ex_{idx}_{item.session_id}",
                session_id=item.session_id,
                prompt=prompt,
                response=response,
                turns=clean_turns,
                rating=item.rating,
                correction=correction,
                metadata={
                    **item.metadata,
                    "redacted_secrets_count": secrets_in_item,
                },
            )
            processed.append(example)
            stats["valid_processed"] += 1

        return processed, stats

    def split_train_val(
        self, examples: list[ProcessedExample]
    ) -> tuple[list[ProcessedExample], list[ProcessedExample]]:
        """Splits examples into disjoint train and validation partitions by session_id.

        Prevents cross-session data leakage.
        """
        if not examples:
            return [], []

        # Group examples by session_id
        session_map: dict[str, list[ProcessedExample]] = {}
        for ex in examples:
            session_map.setdefault(ex.session_id, []).append(ex)

        session_ids = sorted(session_map.keys())
        rng = random.Random(self.config.random_seed)
        rng.shuffle(session_ids)

        num_sessions = len(session_ids)
        if num_sessions <= 1:
            # When only 1 session exists, duplicate into train while keeping val empty or assign to train
            return list(examples), []

        split_idx = max(1, int(num_sessions * self.config.train_ratio))
        # Ensure at least 1 session in val if num_sessions >= 2
        if split_idx >= num_sessions:
            split_idx = num_sessions - 1

        train_sessions = set(session_ids[:split_idx])
        val_sessions = set(session_ids[split_idx:])

        # Invariant check: disjoint splits
        assert train_sessions.isdisjoint(val_sessions), "Train and validation sessions must be strictly disjoint!"

        train_examples = [ex for sid in train_sessions for ex in session_map[sid]]
        val_examples = [ex for sid in val_sessions for ex in session_map[sid]]

        return train_examples, val_examples

    def save_splits(
        self,
        train_examples: list[ProcessedExample],
        val_examples: list[ProcessedExample],
        output_dir: str | Path | None = None,
    ) -> tuple[Path, Path]:
        out = Path(output_dir or self.config.processed_dir)
        out.mkdir(parents=True, exist_ok=True)

        train_path = out / "train.jsonl"
        val_path = out / "val.jsonl"

        with open(train_path, "w", encoding="utf-8") as f:
            for ex in train_examples:
                f.write(json.dumps(asdict(ex), ensure_ascii=False) + "\n")

        with open(val_path, "w", encoding="utf-8") as f:
            for ex in val_examples:
                f.write(json.dumps(asdict(ex), ensure_ascii=False) + "\n")

        return train_path, val_path
