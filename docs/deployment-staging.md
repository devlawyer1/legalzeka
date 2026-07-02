# Staging Deployment

1. Copy `.env.example` to `.env.staging` outside version control and provide staging-only values.
2. Set `STAGING_POSTGRES_PASSWORD`, `STAGING_S3_ACCESS_KEY`, `STAGING_S3_SECRET_KEY`, `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` in the shell or secret manager.
3. Validate configuration with `docker compose -f docker-compose.staging.yml config`.
4. Start dependencies and application services with `docker compose -f docker-compose.staging.yml up -d --build`.
5. Run `docker compose -f docker-compose.staging.yml exec backend npm run migrate:preflight`.
6. Confirm a verified backup exists when preflight requires one, then run `npm run migrate` inside the backend container.
7. Check `/health/live`, `/health/ready` and `/health/dependencies` through the reverse proxy.
8. Run `E2E_BASE_URL=<staging origin> npm run test:e2e` and `npm run smoke:production-like` against a dedicated smoke database.

Do not point staging smoke or integration tests at development or production data. MinIO is staging-only and its bucket remains private.
