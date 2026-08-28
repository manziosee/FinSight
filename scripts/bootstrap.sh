#!/usr/bin/env bash
# Generate local dev secrets and an .env file. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "created .env from .env.example"
fi

# Field-encryption key (Fernet).
if grep -q "REPLACE_ME_WITH" .env; then
  KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null \
        || uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  sed -i.bak "s|^FINSIGHT_FIELD_ENCRYPTION_KEY=.*|FINSIGHT_FIELD_ENCRYPTION_KEY=${KEY}|" .env && rm -f .env.bak
  echo "generated FINSIGHT_FIELD_ENCRYPTION_KEY"
fi

# RS256 signing key for identity-service (mounted via env in k8s; here it self-generates if absent).
mkdir -p infra/local/certs
if [ ! -f infra/local/certs/jwt-private.pem ]; then
  openssl genrsa -out infra/local/certs/jwt-private.pem 2048 2>/dev/null
  echo "generated infra/local/certs/jwt-private.pem (identity-service also self-generates if unset)"
fi

echo "bootstrap complete. Next: make up"
