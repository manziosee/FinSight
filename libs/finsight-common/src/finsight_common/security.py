"""Field-level encryption and hashing helpers for sensitive financial fields."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from cryptography.fernet import Fernet, InvalidToken

from finsight_common.errors import FinSightError


class CryptoError(FinSightError):
    title = "Cryptography Error"
    type = "https://docs.finsight.dev/errors/crypto"


class FieldCipher:
    """Symmetric encryption for at-rest protection of fields like account numbers.

    Use a per-environment key from ``FINSIGHT_FIELD_ENCRYPTION_KEY`` (a Fernet key).
    Generate one with ``Fernet.generate_key()`` and store it in AWS Secrets Manager.
    """

    def __init__(self, key: str | bytes) -> None:
        self._fernet = Fernet(key if isinstance(key, bytes) else key.encode())

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, token: str) -> str:
        try:
            return self._fernet.decrypt(token.encode()).decode()
        except InvalidToken as exc:
            raise CryptoError("could not decrypt field") from exc


def blind_index(value: str, key: str) -> str:
    """Deterministic keyed hash for equality lookups on encrypted columns."""

    return hmac.new(key.encode(), value.strip().lower().encode(), hashlib.sha256).hexdigest()


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def generate_api_key(prefix: str = "fsk") -> tuple[str, str]:
    """Return ``(raw_key, sha256_hash)``. Only the hash is ever stored."""

    raw = f"{prefix}_{secrets.token_urlsafe(32)}"
    return raw, hash_api_key(raw)
