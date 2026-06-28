# Phase 1C OCR, Structured Extraction, and Matter Twin Review

Phase 1C completes the first-phase document workflow. Uploaded documents are
processed into page records, OCR is applied where native text is unavailable,
structured suggestions are generated, and only explicit user acceptance writes
verified Matter Twin data.

## Data Model

Migration `20260627_003_phase1c_matter_extraction.sql` adds:

- `document_pages`: one idempotent row per document/page with native or OCR text,
  dimensions, OCR confidence, and non-sensitive processing metadata.
- `extraction_runs`: provider/model, tenant scope, status, token estimates, cost,
  duration, and safe failure information per extraction version.
- `extraction_suggestions`: grounded PARTY, DATE, EVENT, CASE_NUMBER, COURT, and
  LEGAL_DOMAIN suggestions with review state and target entity linkage.
- `matter_parties` and `matter_events`: user-verified Matter Twin records tied to
  the source document, page, suggestion, and reviewer.
- `cases.legal_domain` for accepted legal-domain metadata.
- `EXTRACT_MATTER_DATA` support in the PostgreSQL job queue.

AI output never writes directly to Matter Twin tables.

## OCR Flow

Digital PDF text is stored page by page. Pages below
`OCR_NATIVE_TEXT_MIN_CHARS`, images, and scanned pages are sent through the
`OcrProvider` interface. The Tesseract implementation is explicitly configured
for `tur`; missing Turkish trained data produces `OCR_LANGUAGE_UNAVAILABLE` and
never silently falls back to English.

Low confidence does not discard a page. Text, confidence, language, and duration
are retained, an audit event is written, and the UI displays a warning.

## Structured Extraction

The extraction job runs below basic document-processing priority. It revalidates
document, case, and personal/organization scope independently from HTTP.

`MatterExtractor`:

- Uses the existing pluggable LLM provider through `chatWithUsage`.
- Disables MCP tools for extraction calls.
- Treats page text as untrusted data and delimits each page.
- Limits page and total context sizes and model call count.
- Requires strict JSON validated with Zod.
- Requires page, exact grounded quote, and confidence for every suggestion.
- Drops suggestions whose normalized quote is absent from the referenced page.
- Uses extraction-version and fingerprint constraints to prevent duplicates.
- Records provider, model, token estimates, cost, duration, and safe errors.

Real paid providers are never called by integration tests; they use a fake LLM
client behind the same extractor interface.

## Review Transactions

Review endpoints require matter write access. An individual accept or reject
locks the suggestion with `FOR UPDATE`.

Accept writes the Matter Twin target and marks the suggestion `ACCEPTED` in the
same transaction. `source_suggestion_id` is unique, so repeated acceptance is
idempotent. PARTY writes `matter_parties`; EVENT and DATE write `matter_events`;
CASE_NUMBER, COURT, and LEGAL_DOMAIN update the verified case metadata.

Reject marks the suggestion `REJECTED` and never writes Matter Twin data.
Repeated rejection is idempotent. Bulk review uses a single all-or-nothing
transaction; any invalid or cross-case suggestion rolls back the complete batch.
Review audit records are mandatory within those transactions.

## API

```text
GET  /api/cases/:caseId/documents/:documentId/suggestions
POST /api/cases/:caseId/suggestions/:suggestionId/accept
POST /api/cases/:caseId/suggestions/:suggestionId/reject
POST /api/cases/:caseId/suggestions/bulk-review
```

## Dependency Isolation

The critical `@xenova/transformers -> onnxruntime-web -> onnx-proto ->
protobufjs` chain was actively used by the old local embedding worker. The
in-process worker and dependency were removed. Existing embedding callers now
use the isolated TEI HTTP service through `src/utils/embedding.js`. OCR and
structured extraction do not depend on this runtime.

Final audit after isolation reports no critical vulnerability. Remaining high
findings are tracked separately for controlled upgrades.

## Runtime Notes

The document worker needs access to the same private upload volume as the API.
For OCR, either allow Tesseract to retrieve Turkish trained data or mount a
trusted local language directory and set `TESSERACT_LANG_PATH`. Production
deployments should package and checksum that language asset rather than depend on
runtime internet access.

Run migration and services only against the intended deployment database:

```bash
docker compose run --rm --no-deps backend npm run migrate
docker compose up -d backend document-worker client
```

Tests continue to require a database whose name contains `test`.

## Open Technical Debt

- Package and checksum Turkish Tesseract data in the worker image.
- Sandbox CPU- and memory-heavy PDF/OCR processing at the infrastructure level.
- Replace estimated token counts with provider-reported usage where available.
- Complete controlled upgrades for remaining npm high-severity findings.
- Add a full page-aware PDF viewer; the current UI exposes page number, quote,
  and authorized document download.
