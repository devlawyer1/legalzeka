# Phase 1B Document Pipeline

Phase 1B moves matter document ingestion to a validated, asynchronous pipeline.
It does not perform OCR, LLM extraction, entity extraction, embeddings, or S3
storage.

## Architecture

- The API authenticates the caller and applies matter write authorization before
  Multer accepts a file.
- Uploads are written under the local provider's private `.tmp` directory.
- Extension, declared MIME, magic bytes, size, UTF-8 text validity, and filename
  shape are validated before storage.
- The service computes SHA-256, runs the configured scanner abstraction, creates
  a UUID storage key, and atomically renames the temporary file.
- Document metadata and one `PROCESS_DOCUMENT` job are committed in one database
  transaction. The endpoint returns `202 Accepted` without parsing the document.
- A separate worker claims jobs with PostgreSQL `FOR UPDATE SKIP LOCKED`.
  PostgreSQL was selected instead of pg-boss because the repository already uses
  `pg`; this adds no production dependency.
- PDF and UTF-8 TXT files receive bounded basic text extraction. JPEG and PNG
  files complete with `ocr_required=true`; OCR is intentionally deferred.
- Deletion soft-deletes metadata immediately and queues an idempotent physical
  `DELETE_DOCUMENT` job.

## Runtime

Configure the values documented in `.env.example`, then run:

```bash
docker compose run --rm --no-deps backend npm run migrate
docker compose up -d postgres backend document-worker client
docker compose ps
docker compose logs -f document-worker
```

`backend` and `document-worker` mount the same private
`legal_document_uploads` volume at `/app/uploads`. Do not publish this directory
through a static HTTP route.

Useful queue checks:

```sql
SELECT status, job_type, count(*)
FROM document_processing_jobs
GROUP BY status, job_type
ORDER BY job_type, status;

SELECT processing_status, count(*)
FROM case_documents
WHERE deleted_at IS NULL
GROUP BY processing_status;
```

## Recovery

The worker retries with configurable backoff and moves exhausted jobs to
`DEAD_LETTER`. A `RUNNING` lock older than `DOCUMENT_JOB_STALE_AFTER_MS` is
recovered on worker startup. Failed documents can be retried only through the
authorized retry endpoint; the new job retains `parent_job_id`.

Graceful `SIGTERM` and `SIGINT` handling stops new claims and allows current work
to finish. Processing results are guarded by the worker lease so a timed-out or
stale worker cannot publish a late result.

## Scanner Policy

`NoopFileScanner` is intended for development and test. Production logs a clear
warning when it is active. Set `FILE_SCANNER_REQUIRED=true` to fail startup until
a real scanner provider is configured. A real malware scanner remains required
before accepting untrusted production uploads.

## Verification

Tests use only a database whose name contains `test`:

```bash
docker compose --profile test up -d postgres-test
docker compose --profile test build backend-test
docker compose --profile test run --rm backend-test
docker compose stop postgres-test
```

No new npm dependency was added for Phase 1B.

## Dependency Audit

The Phase 1B checks originally reported:

- `npm audit --omit=dev`: 3 moderate, 8 high, 1 critical.
- `npm audit`: 1 low, 6 moderate, 8 high, 1 critical.
- The upload-facing direct dependency `multer` was deliberately upgraded from
  2.1.1 to 2.2.0, resolving its high-severity nested-field DoS and incomplete
  aborted-upload cleanup advisories. No bulk audit fix was run.
- Phase 1C removed the in-process `@xenova/transformers` runtime and routes
  embeddings through the isolated TEI HTTP service. The former indirect
  `protobufjs` critical advisory is no longer present in the production tree.
  The current production result is 3 moderate, 5 high, and 0 critical.
- Express and several transitive packages (`form-data`, `hono`, `undici`, and
  `ws`) report fixes that can be evaluated as a controlled lockfile upgrade.
  Nodemailer's reported fix crosses the current direct major-version boundary
  and needs regression testing.
