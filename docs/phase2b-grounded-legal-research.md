# Phase 2B: Grounded Legal Research

## Scope

Phase 2B turns the Phase 2A hybrid-search contract into a tenant-safe legal
research workflow. A model may reason only over source IDs, metadata, and exact
chunk excerpts supplied by the backend. Model output is never treated as a
source quotation.

## Data Model

Migration `20260628_005_phase2b_legal_research.sql` creates:

- `legal_research_sessions`: personal or organization-scoped research history,
  optional Matter link, effective date, legal domain, and soft-delete state.
- `legal_research_messages`: user, assistant, and system-event messages.
- `legal_research_answers`: structured answer, provider usage, token/cost,
  search/verifier timings, cache status, request hash, and idempotency key.
- `legal_research_answer_citations`: every accepted and rejected citation
  attempt with source, chunk, exact excerpt, support type, overlap, and reason.
- `matter_research_notes`: an explicit user-approved snapshot of a research
  answer linked to a Matter.

The migration is additive. It does not alter or delete Phase 1 or Phase 2A
records.

## Orchestrator

`LegalResearchService` performs the following bounded flow:

1. Validate the question, filters, date, Matter, and idempotency key.
2. Resolve personal or organization access through the Phase 1 access context.
3. Search Phase 2A separately for supporting and counter-position sources.
4. Search historical and current legislation versions independently so a legal
   domain filter cannot hide a relevant temporal change.
5. Send only the question, effective date, accepted Matter summary, short
   session context, source metadata, and stored excerpts to the configured LLM.
6. Parse strict JSON and reject unknown source IDs or uncited legal claims.
7. Verify every source/chunk/excerpt/date/claim relation.
8. Remove unsupported claims, persist all verification attempts, and return only
   non-rejected citations.

Counter-source results cannot substitute for an empty supporting-source set.
When supporting evidence is insufficient, the answer is stored as
`INSUFFICIENT` and the main LLM is not called.

## Citation Verification

`CitationVerifier` checks that the source exists in the caller's scope, the
chunk belongs to that source, the excerpt occurs byte-for-byte in the stored
chunk, and legislation is effective on the requested date. Claim support uses a
deterministic Turkish lexical-overlap score. An injected low-cost verifier can
add a second signal without replacing the deterministic checks.

Verification results are `VERIFIED`, `PARTIAL`, or `REJECTED`. Rejected records
remain in PostgreSQL for auditability but are excluded from user responses.

## Matter Twin Boundary

Matter context contains only the accepted legal domain, parties, and events.
Private document text is not sent to the research model and is never added to
the public legal corpus. Matter read access is required for contextual research;
write access and an explicit button action are required to save a result as a
Matter research note. Research answers do not become Matter Twin facts.

## API

Authenticated endpoints:

```text
POST   /api/v1/legal-research/sessions
GET    /api/v1/legal-research/sessions
GET    /api/v1/legal-research/sessions/:sessionId
PATCH  /api/v1/legal-research/sessions/:sessionId
DELETE /api/v1/legal-research/sessions/:sessionId
POST   /api/v1/legal-research/sessions/:sessionId/messages
POST   /api/v1/legal-research/answer
POST   /api/v1/legal-research/sessions/:sessionId/answers/:answerId/save-to-matter
```

`POST /answer` accepts an `Idempotency-Key` header. Reusing a key with the same
request returns the existing answer; using it with a different request returns a
conflict. The route has an authenticated per-user rate limit.

## Frontend

The dashboard contains a `Hukuk Araştırması` workspace with research history,
follow-up questions, court/chamber/source/date/effective-date filters, Matter
selection, confidence, counter-arguments, warnings, citation navigation, source
details, official links, and usage metrics. The Matter workspace exposes the
same workflow in a case-bound `Araştırma` tab.

## Cost Controls

Environment variables bound retrieval count, supporting and counter-source
count, model attempts, output tokens, pricing, and rate limits. Every answer
stores search embedding cost, reranker cost, main model cost, verifier cost,
total cost, tokens, duration, and cache status. Cache hits report zero new
embedding cost.

## Operational Notes

- Set actual provider prices before using cost fields for billing.
- Keep semantic retrieval disabled unless the configured embedding service is
  available and its model matches the stored vector dimension.
- Run migration only through the normal migration runner and first verify it
  against a database whose name contains `test`.
- Multi-instance deployments should move the process-local search cache and
  rate limiter to shared infrastructure while preserving tenant-aware keys.
