import json
from pathlib import Path
from typing import Any

from evolve_ml.preprocessing import ProcessedExample

DEFAULT_SYSTEM_PROMPT = (
    "You are Evolve, an expert autonomous software engineering AI agent. "
    "You write correct, secure, and production-ready code with tests."
)


class SFTDatasetGenerator:
    """Generates Supervised Fine-Tuning (SFT) datasets in standard conversational ChatML format."""

    def __init__(self, system_prompt: str = DEFAULT_SYSTEM_PROMPT) -> None:
        self.system_prompt = system_prompt

    def create_chatml_record(self, example: ProcessedExample) -> dict[str, Any]:
        """Converts a ProcessedExample into a ChatML messages structure."""
        messages: list[dict[str, str]] = []

        # Ensure system prompt is present
        messages.append({"role": "system", "content": self.system_prompt})

        target_assistant = (
            example.correction.strip()
            if example.correction and example.correction.strip()
            else example.response.strip()
        )

        # If turns exist, use them; otherwise use prompt + response
        if example.turns and not example.correction:
            for turn in example.turns:
                role = turn.get("role", "user")
                content = turn.get("content", "").strip()
                if not content:
                    continue
                if role == "system":
                    continue  # We already prepended standard system prompt
                messages.append({"role": role, "content": content})
        else:
            messages.append({"role": "user", "content": example.prompt.strip()})
            messages.append({"role": "assistant", "content": target_assistant})

        # Ensure there is an assistant response at the end
        if messages[-1]["role"] != "assistant":
            messages.append({"role": "assistant", "content": target_assistant})

        return {
            "id": example.id,
            "session_id": example.session_id,
            "messages": messages,
        }

    def generate(self, examples: list[ProcessedExample]) -> list[dict[str, Any]]:
        records = []
        for ex in examples:
            record = self.create_chatml_record(ex)
            if self.validate_record(record):
                records.append(record)
        return records

    def save_jsonl(self, records: list[dict[str, Any]], output_path: str | Path) -> Path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            for rec in records:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return out

    def to_hf_dataset(self, records: list[dict[str, Any]]) -> Any:
        """Converts records into a Hugging Face Dataset."""
        try:
            from datasets import Dataset

            return Dataset.from_list(records)
        except ImportError:
            return records

    @staticmethod
    def validate_record(record: dict[str, Any]) -> bool:
        """Validates that a record satisfies ChatML invariants."""
        if not isinstance(record, dict) or "messages" not in record:
            return False
        messages = record["messages"]
        if not isinstance(messages, list) or len(messages) < 2:
            return False

        has_user = False
        has_assistant = False

        for msg in messages:
            if not isinstance(msg, dict):
                return False
            role = msg.get("role")
            content = msg.get("content", "")
            if not isinstance(content, str) or not content.strip():
                return False
            if role == "user":
                has_user = True
            elif role == "assistant":
                has_assistant = True

        return has_user and has_assistant
