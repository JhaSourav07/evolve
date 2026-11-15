from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ExportConfig:
    """Configuration for exporting interaction sessions and feedback from SQLite."""

    db_path: str = ".evolve/evolve.db"
    min_rating: int = 1
    require_technical_verification: bool = True
    include_written_corrections: bool = True
    export_dir: str = "data/raw"


@dataclass
class PreprocessingConfig:
    """Configuration for secret filtering, deduplication, and data splitting."""

    redact_secrets: bool = True
    deduplicate: bool = True
    train_ratio: float = 0.85
    val_ratio: float = 0.15
    random_seed: int = 42
    max_seq_length: int = 2048
    processed_dir: str = "data/processed"


@dataclass
class LoRAConfig:
    """Parameter-Efficient Fine-Tuning (PEFT / LoRA) configuration."""

    r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: list[str] = field(
        default_factory=lambda: [
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ]
    )
    bias: str = "none"
    task_type: str = "CAUSAL_LM"


@dataclass
class TrainingConfig:
    """Supervised Fine-Tuning (SFT) and QLoRA configuration."""

    base_model_name: str = "Qwen/Qwen2.5-Coder-0.5B-Instruct"
    output_dir: str = "models/evolve-coder-adapter"
    num_train_epochs: int = 3
    per_device_train_batch_size: int = 2
    per_device_eval_batch_size: int = 2
    gradient_accumulation_steps: int = 4
    learning_rate: float = 2e-4
    weight_decay: float = 0.01
    warmup_ratio: float = 0.05
    lr_scheduler_type: str = "cosine"
    logging_steps: int = 10
    eval_strategy: str = "steps"
    eval_steps: int = 50
    save_steps: int = 50
    save_total_limit: int = 2
    load_in_4bit: bool = True
    bf16: bool = True
    fp16: bool = False
    lora: LoRAConfig = field(default_factory=LoRAConfig)
