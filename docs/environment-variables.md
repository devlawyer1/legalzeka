# Environment Variables

The canonical variable list is `.env.example`. Values below are purposes, not secret examples.

## Core

`NODE_ENV`, `PORT`, `RELEASE_VERSION`, `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS` configure runtime and PostgreSQL.

## Security

`JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `JWT_ISSUER`, `JWT_AUDIENCE`, `SECURITY_HASH_PEPPER`, `CREDENTIAL_ENCRYPTION_KEY`, `CORS_ORIGINS`, `LOGIN_RATE_LIMIT_MAX` are mandatory in production. Encryption key material must decode to 32 bytes.

## Shared State and Storage

`REDIS_URL`, `REDIS_KEY_PREFIX`, `STORAGE_PROVIDER`, `STORAGE_TEMP_DIR`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_PREFIX`, `S3_SSE_ALGORITHM`, `S3_SIGNED_URL_MAX_SECONDS` configure external state. Production requires Redis and S3.

## Providers

`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `LLM_PROVIDER_ENABLED`, `LLM_MODEL_ALLOWLIST`, `LLM_DATA_REGION`, `LLM_LOG_RETENTION` configure explicit adapters. Missing credentials produce `UNCONFIGURED`, never a fake fallback.

`LEGAL_RESEARCH_ON_DEMAND_ENABLED`, `LEGAL_RESEARCH_ON_DEMAND_MIN_LOCAL_SOURCES`, `LEGAL_RESEARCH_ON_DEMAND_MAX_DOCUMENTS`, `LEGAL_RESEARCH_ON_DEMAND_TIMEOUT_MS`, `LEGAL_RESEARCH_ON_DEMAND_CACHE_TTL_MS`, `LEGAL_RESEARCH_ON_DEMAND_CONCURRENCY`, `LEGAL_RESEARCH_ON_DEMAND_REQUEST_DELAY_MS`, `LEGAL_RESEARCH_ON_DEMAND_RETRY_ATTEMPTS`, `LEGAL_RESEARCH_ON_DEMAND_RETRY_BASE_DELAY_MS` and the related circuit-breaker variables control bounded Bedesten retrieval when the local court-decision corpus is insufficient. The upstream URL is fixed in code and is not user-configurable.

## Operations

`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ERROR_TRACKING_DSN`, worker intervals, migration timeout/approval variables, backup RPO/RTO and parser resource limits control operations. Secret values belong in a secret manager.
