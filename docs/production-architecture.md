# Production Architecture

## Topology

Traffic enters an external TLS load balancer or the repository Nginx reverse proxy. Only the proxy is public. It routes UI traffic to the Next.js frontend and `/api` plus `/health` traffic to stateless Express backends.

Backend, document, agent, notification and scheduler processes use the same immutable Node image with different commands. Legal-data ingestion and the optional embedding service use separate images. Production state is external:

- Managed PostgreSQL with pgvector is the source of truth and persistent job queue.
- Managed Redis coordinates rate limits, revocations, idempotency, cache, OAuth state and scheduler locks.
- Private S3-compatible storage holds documents, education attachments, exports and encrypted backups.
- SMTP, Google Calendar, OIDC and LLM systems are explicit provider adapters.

No backend or worker instance requires a persistent local disk. Temporary upload and parser files use bounded `tmpfs` storage.

## Trust Boundaries

Tenant authorization is evaluated before storage URL generation or data access. Provider credentials are encrypted at rest. Public health responses contain statuses only. Internal database, Redis, object-storage, embedding and worker ports are never published.

## Scaling

HTTP and worker services can scale horizontally. PostgreSQL uses `FOR UPDATE SKIP LOCKED` for persistent jobs; Redis or PostgreSQL advisory locks serialize scheduled scans and migrations. Idempotency keys protect notifications, calendar events and agent runs.

## Deployment Files

- `docker-compose.staging.yml`: local production-like PostgreSQL, Redis and MinIO.
- `docker-compose.production.yml`: external managed dependencies and immutable image tags.
- `deploy/nginx/legalzeka.conf`: reverse-proxy routing and baseline security headers.
