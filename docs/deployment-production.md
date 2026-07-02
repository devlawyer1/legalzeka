# Production Deployment

Production deployment is intentionally manual-gated. The repository does not deploy automatically.

Required order:

1. Build immutable images tagged with the Git commit and record manifest checksums.
2. Pass syntax, unit, integration, migration, dependency, secret, container and browser checks.
3. Create and restore-verify an encrypted backup.
4. Run migration status and preflight against production using read-only inspection first.
5. Review pending migrations, backup requirements and breaking flags.
6. Obtain manual approval from engineering and the responsible product owner.
7. Apply migrations once under the advisory lock.
8. Roll out backend and workers gradually, then frontend and proxy.
9. Confirm readiness, queue depth, error rate, storage operations and notification delivery.

Use managed PostgreSQL, Redis and private S3. Inject secrets through the deployment platform. Never place `.env.production`, provider credentials or database URLs in Git. TLS should terminate at a managed load balancer or an audited certificate configuration in front of Nginx.

Rollback means restoring the previous application image when schema compatibility allows it. The migration runner does not promise automatic rollback for non-transactional or destructive changes.
