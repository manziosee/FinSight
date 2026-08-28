"""RS256 signing-key management and JWKS document generation."""

from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey


def _b64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class SigningKey:
    def __init__(self, private_pem: str | None, key_id: str) -> None:
        self.key_id = key_id
        if private_pem:
            self._private: RSAPrivateKey = serialization.load_pem_private_key(
                private_pem.encode(), password=None
            )  # type: ignore[assignment]
        else:
            self._private = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    @property
    def private_pem(self) -> str:
        return self._private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()

    def jwks(self) -> dict:
        numbers = self._private.public_key().public_numbers()
        return {
            "keys": [
                {
                    "kty": "RSA",
                    "use": "sig",
                    "alg": "RS256",
                    "kid": self.key_id,
                    "n": _b64url_uint(numbers.n),
                    "e": _b64url_uint(numbers.e),
                }
            ]
        }
