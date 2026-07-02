# Backup and Restore

## PostgreSQL

Run `scripts/backup-postgres.sh` from a trusted operations host with PostgreSQL client tools and OpenSSL. It creates a custom-format dump, encrypts it, removes plaintext and emits a SHA-256 checksum. Upload the encrypted artifact and checksum to private, versioned object storage.

Run `scripts/verify-restore.sh` for every scheduled verification. It checks the artifact checksum, decrypts into a temporary file, creates an empty test database, restores with `--exit-on-error`, validates migrations and tenant tables, then destroys the test database and plaintext file.

A `backup_runs` row is `COMPLETED` after storage and `VERIFIED` only after the restore checks pass. Failed verification must page operations and block release.

## Retention

Use environment-specific retention and lifecycle policies. Keep encrypted full backups plus managed PostgreSQL point-in-time/WAL recovery according to `BACKUP_RPO_MINUTES` and `BACKUP_RTO_MINUTES`.

## Object Storage

Enable bucket versioning, default server-side encryption, blocked public access and lifecycle transitions. Soft-deleted objects remain recoverable until retention expires. Legal-hold objects must be excluded from deletion jobs.
