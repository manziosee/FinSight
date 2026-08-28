#!/bin/bash
# Create one database per service from POSTGRES_MULTIPLE_DATABASES (comma-separated).
set -euo pipefail

create_db() {
  local db="$1"
  echo "  creating database '$db'"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
	SELECT 'CREATE DATABASE "$db"'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
	SQL
}

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  IFS=',' read -ra DBS <<< "$POSTGRES_MULTIPLE_DATABASES"
  for db in "${DBS[@]}"; do
    create_db "$(echo "$db" | tr -d '[:space:]')"
  done
fi
