# Provider Configuration

## SMTP

Configure TLS, timeouts, sender and credentials. Notification jobs require idempotency keys and use retry/backoff plus dead-letter state. Marketing messages require an unsubscribe URL. SMTP without credentials remains `UNCONFIGURED`.

## Google Calendar

Register an OAuth client and exact redirect URI. Tokens are encrypted in `provider_connections`. Mutating calls require explicit user approval and idempotency keys. Outlook remains an unimplemented adapter boundary.

## OIDC

Create an institution identity-provider record with encrypted client secret, exact issuer, discovery URL, allowed domains and redirect URI metadata. Link external subjects administratively; matching email alone never links an account.

## LLM

Enable a provider explicitly, configure environment model allowlists, timeout, retry, cost, data region and provider log-retention metadata. Real-provider smoke runs require a separate explicit flag and are never part of default tests.

## Storage and Antivirus

Use private S3 with blocked public access and server-side encryption. Configure ClamAV and set `FILE_SCANNER_REQUIRED=true` before handling untrusted production uploads.
