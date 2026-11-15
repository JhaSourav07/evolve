from evolve_ml.filters import DeduplicationFilter, SecretFilter


def test_secret_filter_private_key():
    dummy_key = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----"
    text = f"Here is my key: {dummy_key}\nDone."
    assert SecretFilter.has_secrets(text) is True
    redacted, count = SecretFilter.redact(text)
    assert count == 1
    assert "BEGIN RSA PRIVATE KEY" not in redacted
    assert "[REDACTED_SECRET]" in redacted


def test_secret_filter_tokens():
    text = "openai: sk-1234567890abcdefghijklmnopqrstuv, github: ghp_1234567890abcdefghijklmnopqrstuvwxyz12"
    assert SecretFilter.has_secrets(text) is True
    redacted, count = SecretFilter.redact(text)
    assert count >= 2
    assert "sk-" not in redacted
    assert "ghp_" not in redacted
    assert "[REDACTED_SECRET]" in redacted


def test_secret_filter_clean_text():
    clean_text = "def add(a: int, b: int) -> int:\n    return a + b"
    assert SecretFilter.has_secrets(clean_text) is False
    redacted, count = SecretFilter.redact(clean_text)
    assert count == 0
    assert redacted == clean_text


def test_deduplication_filter():
    dedup = DeduplicationFilter()
    prompt1 = "Write a binary search function"
    resp1 = "def binary_search(arr, target): pass"

    assert dedup.is_duplicate(prompt1, resp1) is False
    # Exact duplicate
    assert dedup.is_duplicate(prompt1, resp1) is True
    # Normalized whitespace duplicate
    assert dedup.is_duplicate("  Write a   binary search function  ", resp1) is True

    # Different interaction
    assert dedup.is_duplicate("Write quicksort", resp1) is False
