# Phase 2A: Legal Data Backbone and Hybrid Search

## Scope

Phase 2A adds normalized legal sources, historical legislation, structural chunks,
hybrid retrieval, verifiable excerpts, tenant-safe Matter context, caching, and
search metrics. It does not generate AI answers and does not implement Phase 2B.

## Existing Components Reused

- PostgreSQL Turkish full-text search and pgvector remain the retrieval stores.
- The `intfloat/multilingual-e5-large` TEI container remains the 1024-dimensional
  legal-corpus embedding service.
- The Python legal-data worker remains responsible for Bedesten, Danistay, AYM,
  BAM, and mevzuat ingestion.
- MCP live retrieval and the existing `searchOrchestrator` remain available.
- Existing `decisions`, `decision_chunks`, `legislation`,
  `legislation_articles`, `law_versions`, and `emsal_kararlar` data is preserved.
- The legacy `legalCorpusSearch` entry point now delegates to the normalized
  hybrid engine instead of creating another search implementation.
- Phase 1 access context and Matter ownership checks protect case-aware search.

## Migration

Migration `20260628_004_phase2a_legal_search.sql` creates:

- `legal_sources`: normalized public, organization, or personal legal records.
- `legal_source_origins`: provider identities, source URLs, trust, and hashes.
- `legal_source_chunks`: structural chunks with Turkish FTS and vector indexes.
- `legal_source_citations`: grounded legislation and article references.
- `legal_source_relations`: explicit source and version relations.
- `legislation_versions`: temporal law snapshots and previous/next links.
- `legislation_article_versions`: temporal article text and previous/next links.
- `legal_corpus_state`: monotonically increasing cache invalidation version.
- `legal_search_metrics`: query hashes, timings, cost, user, organization, and
  case scope without storing the raw query.

Legacy decisions, legislation articles, and `law_versions` are backfilled into
the normalized model. The migration does not delete legacy rows.

## Source Identity and Ingestion

Court decisions use a canonical hash derived from court, chamber, case number,
decision number, and decision date. Content hash is the fallback when legal
identity fields are unavailable. A second provider URL creates an origin linked
to the same legal source rather than a duplicate decision.

Official sources and origin trust scores decide which differing text becomes the
canonical content. Re-ingesting an unchanged content hash does not recreate
chunks or call the embedding provider again.

Legislation ingestion maintains a main legislation source plus immutable version
sources. Version and article records contain effective ranges, amendment source,
Official Gazette metadata, and previous/next links. When upstream data lacks a
declared effective date, the record is explicitly marked `OBSERVED` rather than
presenting the observation date as authoritative legal history.

## Structural Chunks

Decision sections are detected as facts, summary, reasoning, legal assessment,
ruling, dissent, footnote, citation, or general content. Legislation is split by
article and transitional article. A bounded paragraph fallback is used only for
oversized structural sections.

Every chunk stores source identity, type, index, content hash, article number,
effective range, metadata, Turkish search vector, and optional embedding.

## Hybrid Ranking

The request is normalized and searched through:

1. PostgreSQL `websearch_to_tsquery('turkish', ...)` full-text retrieval.
2. Optional 1024-dimensional pgvector cosine retrieval.
3. Parameterized metadata and temporal filters.
4. Weighted reciprocal rank fusion with `k = 60`.
5. Explainable deterministic reranking for term coverage, official authority,
   decision identity, and optional Matter legal-domain agreement.
6. Source-level grouping so multiple chunks from one decision occupy one result.

The backend records normalized `keywordScore`, `semanticScore`, `rrfScore`,
`rerankScore`, and `finalScore`. A result excerpt is always an exact substring of
the stored chunk. Additional matching chunks are returned in `otherMatches`.

## Filters

The API supports source type, court, chamber, decision date range, case number,
decision number, legal domain, legislation name, law number, article number,
effective date, and current/historical version status. All SQL values are bound
parameters; user input is never concatenated into SQL syntax.

## API

Authenticated endpoints:

```text
POST /api/v1/legal-search
GET  /api/v1/legal-sources/:sourceId
GET  /api/v1/legal-sources/:sourceId/related
GET  /api/v1/legislation/:id/versions
```

Search pagination is mandatory. `pageSize` is limited to 50 and query length to
1000 characters.

## Matter Twin Context

An optional `caseId` is resolved through Phase 1 matter access controls. Only the
accepted legal domain and accepted event titles may augment the semantic query.
Case documents and private document text are never copied into the public legal
index. Personal matters are owner-only and organization matters require active
membership.

## Cache and Metrics

The bounded in-process LRU cache key includes normalized query, every filter,
effective date, version mode, page, user, organization scopes, case identity,
hashed Matter context, and corpus version. Tenant or case-aware responses cannot
share a public key.

Metrics persist total, FTS, vector, and rerank durations; result count; embedding
provider, model, token estimate, estimated cost; cache hit/miss; user,
organization, case; corpus version; and success state. Only a SHA-256 query hash
and query length are persisted.

## Dependency Security

The active usages were traced as follows:

- `form-data`: Axios transitive multipart implementation.
- `hono`: MCP SDK HTTP dependency.
- `undici`: Cheerio HTTP dependency.
- `ws`: Puppeteer WebSocket dependency.
- `nodemailer`: weekly newsletter SMTP sender.

The four transitive packages are constrained to patched compatible releases.
Nodemailer is upgraded to 9.x after confirming that this project only uses the
stable `createTransport` and `sendMail` surface. Express, `qs`, and `js-yaml` are
also moved to patched compatible versions.

## Remaining Risks

- Historical completeness depends on official upstream history becoming
  available; observed snapshots are not silently represented as exact history.
- The deterministic reranker is explainable but is not a learned legal
  cross-encoder.
- The LRU cache is process-local. Multi-instance deployment should use Redis or
  another tenant-safe shared cache with the same key contract.
- HNSW parameters and candidate limits require production-corpus benchmarking.
- Python ingestion has container import/build verification; a dedicated Python
  integration suite should be added as its extraction rules grow.
- Phase 2B must consume only the grounded result contract and must not turn
  generated prose into source excerpts.
