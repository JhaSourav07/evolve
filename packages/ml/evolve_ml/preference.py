import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from evolve_ml.exporter import RawInteraction
from evolve_ml.filters import SecretFilter
from evolve_ml.preprocessing import ProcessedExample


@dataclass
class DPOPair:
    """Direct Preference Optimization (DPO) pairwise training triplet."""

    id: str
    session_id: str
    prompt: str
    chosen: str
    rejected: str


class PreferenceDatasetGenerator:
    """Generates pairwise preference datasets (prompt, chosen, rejected) for DPO alignment."""

    def __init__(self, redact_secrets: bool = True) -> None:
        self.redact_secrets = redact_secrets

    def from_interactions(self, interactions: list[RawInteraction]) -> list[DPOPair]:
        """Extracts DPO pairs from interactions where both a model response and human correction exist."""
        pairs: list[DPOPair] = []
        for idx, item in enumerate(interactions):
            # Check for correction paired with flawed or initial response
            if item.correction and item.correction.strip():
                prompt = item.prompt
                chosen = item.correction.strip()
                rejected = item.response.strip()

                if not rejected or chosen == rejected:
                    continue

                if self.redact_secrets:
                    prompt, _ = SecretFilter.redact(prompt)
                    chosen, _ = SecretFilter.redact(chosen)
                    rejected, _ = SecretFilter.redact(rejected)

                pair = DPOPair(
                    id=f"dpo_{idx}_{item.session_id}",
                    session_id=item.session_id,
                    prompt=prompt.strip(),
                    chosen=chosen.strip(),
                    rejected=rejected.strip(),
                )
                if self.validate_pair(pair):
                    pairs.append(pair)

        return pairs

    def from_examples(self, examples: list[ProcessedExample]) -> list[DPOPair]:
        """Extracts DPO pairs from ProcessedExample items that contain human corrections."""
        pairs: list[DPOPair] = []
        for idx, ex in enumerate(examples):
            if ex.correction and ex.correction.strip():
                prompt = ex.prompt
                chosen = ex.correction.strip()
                rejected = ex.response.strip()

                if not rejected or chosen == rejected:
                    continue

                if self.redact_secrets:
                    prompt, _ = SecretFilter.redact(prompt)
                    chosen, _ = SecretFilter.redact(chosen)
                    rejected, _ = SecretFilter.redact(rejected)

                pair = DPOPair(
                    id=f"dpo_{idx}_{ex.session_id}",
                    session_id=ex.session_id,
                    prompt=prompt.strip(),
                    chosen=chosen.strip(),
                    rejected=rejected.strip(),
                )
                if self.validate_pair(pair):
                    pairs.append(pair)
        return pairs

    def save_jsonl(self, pairs: list[DPOPair], output_path: str | Path) -> Path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            for pair in pairs:
                f.write(json.dumps(asdict(pair), ensure_ascii=False) + "\n")
        return out

    def to_hf_dataset(self, pairs: list[DPOPair]) -> Any:
        try:
            from datasets import Dataset

            return Dataset.from_list([asdict(p) for p in pairs])
        except ImportError:
            return [asdict(p) for p in pairs]

    @staticmethod
    def validate_pair(pair: DPOPair) -> bool:
        if not pair.prompt or not pair.prompt.strip():
            return False
        if not pair.chosen or not pair.chosen.strip():
            return False
        if not pair.rejected or not pair.rejected.strip():
            return False
        if pair.chosen.strip() == pair.rejected.strip():
            return False
        return True
