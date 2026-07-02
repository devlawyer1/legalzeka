#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_OUTPUT_DIR:?BACKUP_OUTPUT_DIR outside the repository is required}"
: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"

umask 077
mkdir -p "$BACKUP_OUTPUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PLAIN="$BACKUP_OUTPUT_DIR/legalzeka-$STAMP.dump"
ENCRYPTED="$PLAIN.enc"

pg_dump --format=custom --no-owner --no-acl --file="$PLAIN" "$DATABASE_URL"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -in "$PLAIN" -out "$ENCRYPTED" -pass env:BACKUP_ENCRYPTION_PASSWORD
rm -f "$PLAIN"
sha256sum "$ENCRYPTED" > "$ENCRYPTED.sha256"
printf '%s\n' "$ENCRYPTED"
