import json
import logging
from pathlib import Path
from typing import Any

from evolve_ml.config import TrainingConfig

logger = logging.getLogger(__name__)


class SFTModelTrainer:
    """Orchestrates Supervised Fine-Tuning (SFT) using Hugging Face Transformers, PEFT, and TRL."""

    def __init__(self, config: TrainingConfig | None = None) -> None:
        self.config = config or TrainingConfig()

    def get_device(self) -> str:
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass
        return "cpu"

    def build_lora_config(self) -> Any:
        """Constructs PEFT LoRA configuration."""
        try:
            from peft import LoraConfig, TaskType

            return LoraConfig(
                r=self.config.lora.r,
                lora_alpha=self.config.lora.lora_alpha,
                lora_dropout=self.config.lora.lora_dropout,
                target_modules=self.config.lora.target_modules,
                bias=self.config.lora.bias,
                task_type=TaskType.CAUSAL_LM,
            )
        except ImportError:
            return None

    def build_quantization_config(self) -> Any:
        """Constructs BitsAndBytes 4-bit NormalFloat (NF4) QLoRA quantization config."""
        device = self.get_device()
        if device != "cuda" or not self.config.load_in_4bit:
            return None

        try:
            import torch
            from transformers import BitsAndBytesConfig

            return BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16 if self.config.bf16 else torch.float16,
                bnb_4bit_use_double_quant=True,
            )
        except (ImportError, Exception):
            return None

    def train(
        self,
        train_records: list[dict[str, Any]],
        val_records: list[dict[str, Any]] | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Runs the fine-tuning process.

        If dry_run is True or ML libraries are absent, simulates configuration verification and writes adapter metadata.
        """
        out_dir = Path(self.config.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        if dry_run:
            logger.info("Executing dry-run SFT training validation...")
            metadata = {
                "status": "completed_dry_run",
                "base_model": self.config.base_model_name,
                "train_samples": len(train_records),
                "val_samples": len(val_records) if val_records else 0,
                "lora_r": self.config.lora.r,
                "lora_alpha": self.config.lora.lora_alpha,
                "epochs": self.config.num_train_epochs,
            }
            with open(out_dir / "adapter_config.json", "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)
            return metadata

        try:
            import torch
            from datasets import Dataset
            from peft import get_peft_model
            from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
            from trl import SFTTrainer
        except ImportError as e:
            logger.warning(f"ML dependencies missing ({e}); running dry-run adapter export.")
            return self.train(train_records, val_records, dry_run=True)

        # 1. Prepare datasets
        train_dataset = Dataset.from_list(train_records)
        eval_dataset = Dataset.from_list(val_records) if val_records else None

        # 2. Tokenizer
        tokenizer = AutoTokenizer.from_pretrained(
            self.config.base_model_name,
            trust_remote_code=True,
            use_fast=True,
        )
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        # 3. Model with QLoRA or native precision
        quant_config = self.build_quantization_config()
        device = self.get_device()
        torch_dtype = torch.bfloat16 if self.config.bf16 and device == "cuda" else torch.float32

        model = AutoModelForCausalLM.from_pretrained(
            self.config.base_model_name,
            quantization_config=quant_config,
            torch_dtype=torch_dtype,
            device_map="auto" if device == "cuda" else None,
            trust_remote_code=True,
        )

        peft_config = self.build_lora_config()
        if peft_config:
            model = get_peft_model(model, peft_config)

        # 4. Training arguments
        training_args = TrainingArguments(
            output_dir=str(out_dir),
            num_train_epochs=self.config.num_train_epochs,
            per_device_train_batch_size=self.config.per_device_train_batch_size,
            per_device_eval_batch_size=self.config.per_device_eval_batch_size,
            gradient_accumulation_steps=self.config.gradient_accumulation_steps,
            learning_rate=self.config.learning_rate,
            weight_decay=self.config.weight_decay,
            warmup_ratio=self.config.warmup_ratio,
            lr_scheduler_type=self.config.lr_scheduler_type,
            logging_steps=self.config.logging_steps,
            eval_strategy=self.config.eval_strategy if eval_dataset else "no",
            eval_steps=self.config.eval_steps if eval_dataset else None,
            save_steps=self.config.save_steps,
            save_total_limit=self.config.save_total_limit,
            bf16=self.config.bf16 and device == "cuda",
            fp16=self.config.fp16 and device == "cuda",
            report_to="none",
        )

        # 5. SFT Trainer
        trainer = SFTTrainer(
            model=model,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            peft_config=peft_config,
            args=training_args,
        )

        train_result = trainer.train()
        trainer.save_model(str(out_dir))
        tokenizer.save_pretrained(str(out_dir))

        metrics = train_result.metrics
        with open(out_dir / "training_metrics.json", "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2)

        return metrics
