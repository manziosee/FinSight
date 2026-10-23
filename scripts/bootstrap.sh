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

# Local-only infra passwords: fill any that are missing or empty (never overwrites a value).
for VAR in REDIS_PASSWORD GRAFANA_ADMIN_PASSWORD; do
  if ! grep -qE "^${VAR}=.+" .env; then
    VALUE=$(openssl rand -hex 24)
    if grep -qE "^${VAR}=" .env; then
      sed -i.bak "s|^${VAR}=.*|${VAR}=${VALUE}|" .env && rm -f .env.bak
    else
      printf '%s=%s\n' "$VAR" "$VALUE" >> .env
    fi
    echo "generated ${VAR}"
  fi
done

# RS256 signing key for identity-service (mounted via env in k8s; here it self-generates if absent).
mkdir -p infra/local/certs
if [ ! -f infra/local/certs/jwt-private.pem ]; then
  openssl genrsa -out infra/local/certs/jwt-private.pem 2048 2>/dev/null
  echo "generated infra/local/certs/jwt-private.pem (identity-service also self-generates if unset)"
fi

echo "bootstrap complete. Next: make up (Grafana login: admin / GRAFANA_ADMIN_PASSWORD in .env)"
