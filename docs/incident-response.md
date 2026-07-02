# Incident Response

Severity is based on confidentiality, integrity, availability and tenant scope. Security events use `INFO`, `LOW`, `MEDIUM`, `HIGH` and `CRITICAL`.

1. Acknowledge and assign an incident commander.
2. Preserve request IDs, trace IDs, audit hashes, release version and provider event references without copying client content into chat systems.
3. Contain: revoke sessions, disable a provider, pause workers or block traffic at the proxy.
4. Assess affected tenants and legal/KVKK notification obligations.
5. Eradicate the cause, rotate secrets and verify audit integrity.
6. Recover through the tested backup/runbook path and monitor.
7. Document timeline, impact, decisions and corrective work.

Refresh-token reuse, audit mutation, cross-tenant access, public bucket exposure and backup restore failure are immediate high-severity signals.
