# Operations Runbook

Daily checks:

- `/health/ready` is `UP`; dependencies show no required service down.
- Document, agent and notification queue depth is stable.
- Dead-letter count, provider errors, HTTP error rate and latency remain within alert thresholds.
- Last backup is restore-verified within the RPO window.
- Storage, antivirus, SMTP, Redis and migration warnings are resolved.

Worker actions are service-level only: restart a failed instance, pause a provider or requeue an audited dead-letter job. The admin UI does not expose shell or SQL.

Before maintenance, drain traffic, stop schedulers, wait for running jobs, then stop workers and backend. On startup, validate managed dependencies, run migration preflight/approval, start backend, then workers, frontend and proxy.

Use request ID and trace ID to correlate structured logs. Never paste full prompts, documents, student answers, client messages or secrets into incident tooling.
