#!/usr/bin/env bash
# Create the `tpl` and `rsp` databases and apply their schemas.
#
# Usage:  ./scripts/setup-db.sh
# Env:    PGHOST (default localhost), PGPORT (5432), PGUSER (postgres),
#         PGPASSWORD (password), PGDATABASE admin db (postgres)
set -euo pipefail

cd "$(dirname "$0")/.."

PGHOST=${PGHOST:-localhost}
PGPORT=${PGPORT:-5432}
PGUSER=${PGUSER:-postgres}
ADMIN_DB=${ADMIN_DB:-postgres}
export PGPASSWORD=${PGPASSWORD:-password}

psql_args=(-h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$ADMIN_DB")

for db in tpl rsp; do
  if ! psql "${psql_args[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    psql "${psql_args[@]}" -c "CREATE DATABASE $db"
  fi
done

psql "${psql_args[@]}" -d tpl -f tpl-backend/tpl/sql/001_initial.sql
psql "${psql_args[@]}" -d rsp -f rsp-backend/src/rsp_backend/sql/001_initial.sql
psql "${psql_args[@]}" -d rsp -f rsp-backend/src/rsp_backend/sql/002_indexes.sql

echo "DB setup complete: databases 'tpl' and 'rsp' are ready."
