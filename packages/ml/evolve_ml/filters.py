import hashlib
import re
from typing import Any


class SecretFilter:
    """Scans and redacts sensitive credentials, private keys, and API tokens from training datasets."""

    SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
        # Private keys (RSA, OpenSSH, EC)
        (
            "PRIVATE_KEY",
            re.compile(r"-----BEGIN[ A-Z_-]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z_-]*PRIVATE KEY-----"),
        ),
        # OpenAI API keys
        ("OPENAI_KEY", re.compile(r"\bsk-[a-zA-Z0-9T3BlbkFJ]{20,}\b")),
        # GitHub tokens
        ("GITHUB_TOKEN", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{36,}\b")),
        # AWS Access Key ID
        ("AWS_KEY", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
        # Hugging Face tokens
        ("HF_TOKEN", re.compile(r"\bhf_[a-zA-Z0-9]{34,}\b")),
        # Generic Bearer tokens
        ("BEARER_TOKEN", re.compile(r"\bBearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)),
        # Database connection strings with credentials
        (
            "DATABASE_URI",
            re.compile(r"\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s]+\b"),
        ),
        # Password / secret assignments
        (
            "GENERIC_SECRET",
            re.compile(
                r"""(?i)(?:api_key|apikey|secret|password|passwd|auth_token)\s*[:=]\s*['"]([^\s'"]{8,})['"]"""
            ),
        ),
    ]

    @classmethod
    def has_secrets(cls, text: str) -> bool:
        if not text:
            return False
        return any(pattern.search(text) is not None for _, pattern in cls.SECRET_PATTERNS)

    @classmethod
    def redact(cls, text: str) -> tuple[str, int]:
        """Redacts all matched secret tokens with [REDACTED_SECRET].

        Returns the sanitized text and the number of redactions made.
        """
        if not text:
            return text, 0

        redacted = text
        count = 0

        for name, pattern in cls.SECRET_PATTERNS:
            matches = list(pattern.finditer(redacted))
            if matches:
                count += len(matches)
                redacted = pattern.sub("[REDACTED_SECRET]", redacted)

        return redacted, count


class DeduplicationFilter:
    """Removes duplicate interaction pairs based on normalized cryptographic content hashes."""

    def __init__(self) -> None:
        self._seen_hashes: set[str] = set()

    @staticmethod
    def compute_hash(prompt: str, response: str) -> str:
        """Computes SHA-256 fingerprint over normalized prompt and response."""
        norm_prompt = " ".join(prompt.strip().split())
        norm_response = " ".join(response.strip().split())
        payload = f"{norm_prompt} ||| {norm_response}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def is_duplicate(self, prompt: str, response: str) -> bool:
        h = self.compute_hash(prompt, response)
        if h in self._seen_hashes:
            return True
        self._seen_hashes.add(h)
        return False

    def reset(self) -> None:
        self._seen_hashes.clear()
