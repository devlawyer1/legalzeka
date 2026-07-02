# KVKK Data Lifecycle

## Classification

- `PUBLIC`: published legal sources and public product material.
- `INTERNAL`: operational metadata and non-client configuration.
- `CONFIDENTIAL`: institution, billing and business records.
- `CLIENT_CONFIDENTIAL`: Matter, document, draft, portal and communication data.
- `SPECIAL_CATEGORY`: sensitive personal data requiring heightened controls.
- `AUTH_SECRET`: password hashes, MFA secrets, refresh tokens and provider credentials.

Privacy requests require identity verification and tenant scoping. Exports are private, time-limited and recorded in `data_export_jobs`. Correction and restriction requests remain workflow records. Deletion eligibility checks legal holds and statutory financial/legal retention before any physical deletion.

Soft deletion removes normal access; physical deletion occurs asynchronously after retention and hold checks. The response must explain retained categories and reasons. Provider data-region and log-retention metadata must be visible to administrators.

Exports must never include another tenant. Audit export contains event metadata, not document text or client messages.
