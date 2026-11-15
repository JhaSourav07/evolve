import argparse
import json
import logging
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any

from evolve_ml.config import ExportConfig, PreprocessingConfig, TrainingConfig
from evolve_ml.eval import ModelEvaluator
from evolve_ml.exporter import SQLiteInteractionExporter
from evolve_ml.preference import PreferenceDatasetGenerator
from evolve_ml.preprocessing import DatasetPreprocessor
from evolve_ml.sft import SFTDatasetGenerator
from evolve_ml.train import SFTModelTrainer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("evolve_ml.pipeline")


class EvolveMLPipeline:
    """End-to-end ML pipeline: Interaction Export -> Sanitization & Deduplication -> SFT & DPO Generation -> Baseline Eval -> Fine-Tuning -> Evaluation."""

    def __init__(
        self,
        export_config: ExportConfig | None = None,
        preprocessing_config: PreprocessingConfig | None = None,
        training_config: TrainingConfig | None = None,
    ) -> None:
        self.export_config = export_config or ExportConfig()
        self.preprocessing_config = preprocessing_config or PreprocessingConfig()
        self.training_config = training_config or TrainingConfig()

        self.exporter = SQLiteInteractionExporter(self.export_config)
        self.preprocessor = DatasetPreprocessor(self.preprocessing_config)
        self.sft_generator = SFTDatasetGenerator()
        self.preference_generator = PreferenceDatasetGenerator(
            redact_secrets=self.preprocessing_config.redact_secrets
        )
        self.evaluator = ModelEvaluator(self.training_config.base_model_name)
        self.trainer = SFTModelTrainer(self.training_config)

    def run(
        self,
        db_path: str | Path | None = None,
        dry_run: bool = False,
        baseline_only: bool = False,
    ) -> dict[str, Any]:
        logger.info("Step 1: Exporting interactions from Evolve SQLite persistence...")
        raw_interactions = self.exporter.export_raw(db_path)
        logger.info(f"Exported {len(raw_interactions)} raw interactions.")

        logger.info("Step 2: Preprocessing, secret redaction, and deduplication...")
        valid_examples, prep_stats = self.preprocessor.process_raw(raw_interactions)
        logger.info(f"Preprocessing stats: {prep_stats}")

        train_examples, val_examples = self.preprocessor.split_train_val(valid_examples)
        logger.info(f"Disjoint splits: {len(train_examples)} train, {len(val_examples)} val.")

        processed_dir = Path(self.preprocessing_config.processed_dir)
        processed_dir.mkdir(parents=True, exist_ok=True)
        self.preprocessor.save_splits(train_examples, val_examples, processed_dir)

        logger.info("Step 3: Generating SFT ChatML datasets...")
        train_sft = self.sft_generator.generate(train_examples)
        val_sft = self.sft_generator.generate(val_examples)
        self.sft_generator.save_jsonl(train_sft, processed_dir / "sft_train.jsonl")
        self.sft_generator.save_jsonl(val_sft, processed_dir / "sft_val.jsonl")
        logger.info(f"Generated SFT datasets: {len(train_sft)} train, {len(val_sft)} val.")

        logger.info("Step 4: Generating DPO pairwise preference datasets...")
        dpo_pairs = self.preference_generator.from_examples(valid_examples)
        self.preference_generator.save_jsonl(dpo_pairs, processed_dir / "dpo_pairs.jsonl")
        logger.info(f"Generated {len(dpo_pairs)} DPO preference pairs.")

        logger.info("Step 5: Establishing baseline benchmark on validation set before fine-tuning...")
        val_predictions = [ex.response for ex in val_examples] if val_examples else [ex.response for ex in train_examples[:5]]
        baseline_eval = self.evaluator.evaluate_predictions(val_predictions)
        logger.info(f"Baseline benchmark: {baseline_eval.to_dict()}")

        results = {
            "stats": prep_stats,
            "train_samples": len(train_sft),
            "val_samples": len(val_sft),
            "dpo_samples": len(dpo_pairs),
            "baseline_metrics": baseline_eval.to_dict(),
        }

        if baseline_only:
            logger.info("Pipeline completed at baseline benchmark stage.")
            return results

        logger.info("Step 6: Executing model fine-tuning (QLoRA / LoRA)...")
        train_result = self.trainer.train(
            train_records=train_sft,
            val_records=val_sft if val_sft else None,
            dry_run=dry_run,
        )
        results["training_result"] = train_result
        logger.info("Pipeline execution successfully completed!")
        return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Evolve ML Pipeline")
    parser.add_argument("--db", type=str, default=".evolve/evolve.db", help="Path to Evolve SQLite database")
    parser.add_argument("--output-dir", type=str, default="models/evolve-coder-adapter", help="Output directory for adapters")
    parser.add_argument("--dry-run", action="store_true", help="Run without downloading or training large model weights")
    parser.add_argument("--baseline-only", action="store_true", help="Establish baseline metrics without fine-tuning")

    args = parser.parse_args()

    pipeline = EvolveMLPipeline(
        export_config=ExportConfig(db_path=args.db),
        training_config=TrainingConfig(output_dir=args.output_dir),
    )
    result = pipeline.run(
        db_path=args.db,
        dry_run=args.dry_run,
        baseline_only=args.baseline_only,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
