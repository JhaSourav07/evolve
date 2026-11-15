import ast
import math
import re
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class EvalResult:
    """Evaluation metrics summary for baseline or fine-tuned model."""

    model_name: str
    num_samples: int
    syntax_validity_rate: float
    avg_perplexity: float | None = None
    avg_loss: float | None = None
    custom_metrics: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SyntaxValidator:
    """Verifies syntactic correctness of generated code blocks without executing untrusted code."""

    @classmethod
    def extract_code_blocks(cls, text: str, language: str = "python") -> list[str]:
        """Extracts code enclosed in Markdown fences matching language."""
        pattern = rf"```(?:{language}|py)?\s*([\s\S]*?)```"
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return [m.strip() for m in matches if m.strip()]
        # If no markdown fences found, check if entire text is raw code
        return [text.strip()] if text.strip() else []

    @classmethod
    def validate_python(cls, code: str) -> bool:
        if not code.strip():
            return False
        try:
            ast.parse(code)
            return True
        except (SyntaxError, ValueError, OverflowError):
            return False

    @classmethod
    def validate_brackets(cls, text: str) -> bool:
        """Heuristic check for balanced delimiters in JS/TS or generic code."""
        stack: list[str] = []
        pairs = {")": "(", "}": "{", "]": "["}
        # Strip strings to avoid counting brackets in literals
        stripped = re.sub(r"'(?:\\.|[^'])*'|\"(?:\\.|[^\"])*\"|`[\s\S]*?`", "", text)
        for char in stripped:
            if char in "({[":
                stack.append(char)
            elif char in ")}]":
                if not stack or stack[-1] != pairs[char]:
                    return False
                stack.pop()
        return len(stack) == 0


class ModelEvaluator:
    """Evaluates base and adapter models on validation datasets to establish baselines."""

    def __init__(self, model_name: str = "Qwen/Qwen2.5-Coder-0.5B-Instruct") -> None:
        self.model_name = model_name

    def evaluate_predictions(
        self, predictions: list[str], ground_truths: list[str] | None = None
    ) -> EvalResult:
        """Evaluates a batch of generated predictions for syntax validity and keyword overlap."""
        if not predictions:
            return EvalResult(
                model_name=self.model_name,
                num_samples=0,
                syntax_validity_rate=0.0,
            )

        valid_syntax_count = 0
        total = len(predictions)

        for pred in predictions:
            blocks = SyntaxValidator.extract_code_blocks(pred)
            if not blocks:
                # Check bracket balance
                if SyntaxValidator.validate_brackets(pred):
                    valid_syntax_count += 1
                continue

            all_valid = True
            for block in blocks:
                if not (SyntaxValidator.validate_python(block) or SyntaxValidator.validate_brackets(block)):
                    all_valid = False
                    break
            if all_valid:
                valid_syntax_count += 1

        syntax_rate = valid_syntax_count / total if total > 0 else 0.0

        return EvalResult(
            model_name=self.model_name,
            num_samples=total,
            syntax_validity_rate=round(syntax_rate, 4),
        )

    def evaluate_perplexity(
        self,
        model: Any,
        tokenizer: Any,
        eval_texts: list[str],
        max_length: int = 512,
        device: str = "cpu",
    ) -> tuple[float, float]:
        """Calculates cross-entropy loss and perplexity on evaluation texts."""
        if not eval_texts:
            return 0.0, 1.0

        try:
            import torch

            model.eval()
            total_loss = 0.0
            total_batches = 0

            with torch.no_grad():
                for text in eval_texts:
                    encodings = tokenizer(
                        text,
                        return_tensors="pt",
                        truncation=True,
                        max_length=max_length,
                    )
                    input_ids = encodings.input_ids.to(device)
                    target_ids = input_ids.clone()

                    outputs = model(input_ids, labels=target_ids)
                    loss = outputs.loss
                    if loss is not None and not torch.isnan(loss):
                        total_loss += loss.item()
                        total_batches += 1

            if total_batches == 0:
                return 0.0, 1.0

            avg_loss = total_loss / total_batches
            perplexity = math.exp(avg_loss) if avg_loss < 100 else float("inf")
            return round(avg_loss, 4), round(perplexity, 4)
        except Exception:
            return 0.0, 1.0
