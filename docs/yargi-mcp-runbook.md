# LegalZeka Yargi MCP Runbook

## Ownership
- Runtime dependency must point to LegalZeka self-hosted MCP, not public remote MCP.
- LegalZeka MCP repo: `devlawyer1/yargi-mcp`
- Upstream repo: `saidsurucu/yargi-mcp`
- Production image: `ghcr.io/devlawyer1/yargi-mcp:v0.2.0-lz.1`

## Local Development
1. Keep `YARGI_MCP_URL=http://localhost:8000`.
2. Copy `docker-compose.override.example.yml` to `docker-compose.override.yml` when you want to build `services/yargi-mcp` locally.
3. Run `docker compose up -d yargi-mcp backend`.
4. Smoke test with `npm run smoke:yargi`.

## Upstream Update
1. In the MCP repo, keep remotes as:
   - `origin=https://github.com/devlawyer1/yargi-mcp`
   - `upstream=https://github.com/saidsurucu/yargi-mcp`
2. Run `git fetch upstream`.
3. Merge upstream into `legalzeka-stable`.
4. Re-apply only LegalZeka runtime patches if needed.
5. Build and smoke test the image.
6. Tag a new immutable version, for example `v0.2.1-lz.1`.
7. Update `docker-compose.yml` to the new pinned image tag.

## Production Rules
- Do not set `YARGI_MCP_URL` to `yargimcp.surucu.dev`, `yargimcp.fastmcp.app`, the Railway Pro URL, or `yargi.betaspacestudio.com` unless `YARGI_MCP_ALLOW_REMOTE=true` is explicitly approved for emergency testing.
- Keep `EMSAL_LIVE_MCP=true` only when the MCP sidecar is healthy.
- If MCP is degraded, the app must continue serving local Postgres FTS/vector cache results.
