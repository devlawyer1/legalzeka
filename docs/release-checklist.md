# Release Checklist

- [ ] Immutable Git SHA images built and checksummed.
- [ ] Lockfiles unchanged after clean install.
- [ ] Syntax, lint, unit and integration tests pass.
- [ ] Backend, frontend and all worker images build.
- [ ] Production dependency audits are clean.
- [ ] Secret and container scans are reviewed.
- [ ] Browser E2E passes against staging.
- [ ] Migration status, checksum and preflight pass.
- [ ] Required backup is restore-verified.
- [ ] Staging smoke passes and test data is cleaned.
- [ ] Provider health/model capability checks pass without unsafe fallback.
- [ ] Security/config warnings are accepted or resolved.
- [ ] Manual engineering, security and product approval recorded.
- [ ] Production rollout and rollback owners assigned.
- [ ] Post-deploy health, queues, storage, notifications and AI cost monitored.

The CI release gate never performs production deployment. A failed migration, restore verification, browser test or security gate stops release.
