# Security Model

Authentication uses short-lived JWT access tokens bound to database sessions. Refresh tokens are opaque, hashed, rotated and reuse-detected. Password changes, MFA changes and logout-all revoke sessions. TOTP and one-time hashed recovery codes are supported; SMS MFA is not.

Cookie-authenticated writes require double-submit CSRF validation. Production CORS uses an explicit allowlist. Redis-backed auth limits fail closed. OIDC uses discovery, state, nonce, PKCE, issuer/audience verification, redirect allowlists and administrator-controlled account linking.

Tenant scope is enforced before database resources, storage objects and signed URLs are returned. Storage keys are random and buckets private. Uploads have MIME, size, page and object limits and an antivirus interface.

Provider secrets use AES-256-GCM application encryption and platform secret injection. Logs and traces exclude prompts, document text, answers, messages, tokens and credentials. Audit events are append-only and hash-chained.

Known boundary: SAML is an interface-level technical debt; OIDC is the implemented enterprise protocol. A real ClamAV deployment must be enabled before accepting untrusted production uploads.
