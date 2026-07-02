# Disaster Recovery

Declare RPO and RTO per environment with `BACKUP_RPO_MINUTES` and `BACKUP_RTO_MINUTES`. Production defaults must be approved against business requirements.

Recovery order:

1. Freeze writes and record the incident timestamp.
2. Select the latest restore-verified full backup and required WAL/PITR point.
3. Restore into an isolated database and run `npm run migrate:verify` plus tenant sanity checks.
4. Validate the private object bucket version/lifecycle state and Redis can be rebuilt from durable sources.
5. Rotate compromised credentials and provider tokens.
6. Point a staging application at the restored state and run smoke plus browser checks.
7. Obtain incident commander approval before traffic cutover.
8. Monitor error rates, queue depth and data consistency; retain evidence for the post-incident review.

Redis loss may invalidate sessions, locks and cache, but must not lose PostgreSQL jobs or legal data. Object-storage recovery must honor legal holds.
