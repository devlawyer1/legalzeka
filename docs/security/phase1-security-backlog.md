# Phase 1 Security Backlog

This document records security work intentionally left outside Phase 1A. The
public upload route was removed in Phase 1A; the items below require separate,
reviewable changes rather than partial implementations.

## Authentication and sessions

- Use separate secrets and signing policies for access and refresh tokens.
- Implement one-time refresh token rotation and reuse detection.
- Store only hashed refresh tokens with device and session metadata.
- Add explicit session and token revocation.
- Evaluate replacing browser `localStorage` tokens with `HttpOnly`, `Secure`,
  and appropriate `SameSite` cookies together with CSRF protection.

## HTTP and application security

- Replace wildcard production CORS with an environment-specific allowlist.
- Standardize safe production error responses and structured internal logs.
- Extend Phase 1B magic-byte validation to any future upload surface before it is enabled.
- Replace the Phase 1B scanner abstraction with antivirus scanning and a quarantine state.
- Define endpoint-specific rate limits for authentication, AI, search, uploads,
  downloads, and automation endpoints.
- Review and tighten CSP, HSTS, Referrer-Policy, Permissions-Policy, and other
  security headers.

## Storage and infrastructure

- Move documents from local storage to private S3-compatible object storage.
- Use short-lived authorized downloads or application streaming; never expose
  stable public object URLs.
- Close PostgreSQL, MCP, and embedding ports to the public network in production.
- Run the Next.js production build/server rather than the development server.
- Use workload roles or instance profiles instead of long-lived AWS credentials.

## Database isolation

- Evaluate PostgreSQL Row-Level Security as defense in depth for personal and
  organization scopes.
- Keep service-layer and query-level authorization even if RLS is introduced.
- Add resource-level permissions for assigned lawyers and restricted matters.
- Define retention, legal hold, soft-delete, and permanent deletion policies.

## Verification

- Add dependency vulnerability triage and a controlled upgrade policy.
- Add authorization regression tests for every new matter-bound endpoint.
- Add upload fuzzing, malicious archive, parser sandboxing, and audit integrity tests.
