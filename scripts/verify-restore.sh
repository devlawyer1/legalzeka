#!/usr/bin/env sh
set -eu

: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"

sha256sum -c "$BACKUP_FILE.sha256"
TEST_DB="legalzeka_restore_test_$(date +%s)_$$"
PLAIN="$(mktemp)"
cleanup() {
  rm -f "$PLAIN"
  psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TEST_DB'" >/dev/null 2>&1 || true
  psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$BACKUP_FILE" -out "$PLAIN" -pass env:BACKUP_ENCRYPTION_PASSWORD
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $TEST_DB" >/dev/null
RESTORE_URL="${ADMIN_DATABASE_URL%/*}/$TEST_DB"
pg_restore --no-owner --no-acl --exit-on-error --dbname="$RESTORE_URL" "$PLAIN"
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM schema_migrations; SELECT count(*) FROM users; SELECT count(*) FROM law_firms;" >/dev/null
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -c "SELECT 1 FROM schema_migrations WHERE version='20260630_011_phase8_enterprise_operations'" | grep -q 1
printf '%s\n' "restore verification passed: $TEST_DB"
