# Phase 1A Matter Scope

## Scope rules

- `PERSONAL`: `owner_user_id` is the authenticated user and both firm columns are null.
- `ORGANIZATION`: `law_firm_id` is required and the user must have an active
  membership in an active law firm.
- The legacy `firm_id` column remains synchronized with `law_firm_id` for
  backward compatibility.
- Existing `Admin` users are explicit system-level exceptions.
- Active firm roles can read and write organization matters. Only `kurucu` and
  `ortak` satisfy matter administration checks.

## Migration

Run migrations with:

```bash
npm run migrate
```

The runner obtains a PostgreSQL advisory lock, applies each migration in its
own transaction, records its SHA-256 checksum, and rejects changed migrations.
An empty database receives `database.sql` as its baseline before incremental
migrations are applied.

## Tests

The integration suite refuses database names that do not contain `test`.

```bash
docker compose build backend-test
docker compose run --rm backend-test
```

The `backend-test` service uses the disposable `postgres-test` service and does
not connect to the development or production database.

## Document downloads

`/uploads` is no longer public. Documents are downloaded through:

```text
GET /api/cases/:caseId/documents/:documentId/download
```

The route requires JWT authentication, matter access, exact case/document
matching, and a storage key that resolves beneath the configured uploads root.
