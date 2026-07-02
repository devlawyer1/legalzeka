# Provider Configuration

## SMTP

Configure TLS, timeouts, sender and credentials. Notification jobs require idempotency keys and use retry/backoff plus dead-letter state. Marketing messages require an unsubscribe URL. SMTP without credentials remains `UNCONFIGURED`.

## Google Calendar

Register an OAuth client and exact redirect URI. Tokens are encrypted in `provider_connections`. Mutating calls require explicit user approval and idempotency keys. Outlook remains an unimplemented adapter boundary.

## OIDC

Create an institution identity-provider record with encrypted client secret, exact issuer, discovery URL, allowed domains and redirect URI metadata. Link external subjects administratively; matching email alone never links an account.

## LLM

Enable a provider explicitly, configure environment model allowlists, timeout, retry, cost, data region and provider log-retention metadata. Real-provider smoke runs require a separate explicit flag and are never part of default tests.

## On-demand Legal Sources

When `LEGAL_RESEARCH_ON_DEMAND_ENABLED=true`, grounded legal research searches the local corpus first and calls the fixed official Bedesten endpoint only when local court-decision evidence is below the configured threshold. At most `LEGAL_RESEARCH_ON_DEMAND_MAX_DOCUMENTS` full decisions are fetched, normalized and deduplicated into the corpus. Query cache, concurrency limits, request spacing, one bounded transient-error retry, timeouts and a circuit breaker protect the upstream service. Provider failure never enables an ungrounded answer; the request continues with local sources and an explicit warning.

## Storage and Antivirus

Use private S3 with blocked public access and server-side encryption. Configure ClamAV and set `FILE_SCANNER_REQUIRED=true` before handling untrusted production uploads.
