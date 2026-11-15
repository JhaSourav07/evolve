from evolve_ml.eval import ModelEvaluator, SyntaxValidator


def test_syntax_validator_python():
    valid_py = "```python\ndef greet(name: str) -> str:\n    return f'Hello, {name}'\n```"
    invalid_py = "```python\ndef broken(:\n    pass\n```"

    blocks_valid = SyntaxValidator.extract_code_blocks(valid_py)
    assert len(blocks_valid) == 1
    assert SyntaxValidator.validate_python(blocks_valid[0]) is True

    blocks_invalid = SyntaxValidator.extract_code_blocks(invalid_py)
    assert len(blocks_invalid) == 1
    assert SyntaxValidator.validate_python(blocks_invalid[0]) is False


def test_syntax_validator_brackets():
    assert SyntaxValidator.validate_brackets("function test() { return [1, 2, 3]; }") is True
    assert SyntaxValidator.validate_brackets("function test() { return [1, 2, 3; }") is False


def test_model_evaluator_predictions():
    evaluator = ModelEvaluator("Qwen/Qwen2.5-Coder-0.5B-Instruct")
    predictions = [
        "```python\ndef add(a, b): return a + b\n```",
        "```python\ndef mul(a, b): return a * b\n```",
        "```python\ndef invalid(a, b: return\n```",
    ]
    result = evaluator.evaluate_predictions(predictions)
    assert result.num_samples == 3
    # 2 out of 3 valid
    assert result.syntax_validity_rate == 0.6667
