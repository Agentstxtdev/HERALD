# @agentstxtdev/herald

## 0.2.0

### Minor Changes

- - Add four new discovery generators: `generateApiCatalog` (RFC 9727),
    `generateMcpServerCard` (SEP-2127), `generateAgentSkillsIndex`
    (Cloudflare RFC v0.2.0), `generateOpenApiJson` (Payment Discovery draft).
  - Extend `McpConfig` with `serverCard?`, `SkillEntry` with `name? / type? /
digest?`, `PaymentConfig` with `openapi?`.
  - Generate matching `_headers` entries (CORS for the new well-known paths)
    and RFC 8288 `Link:` headers on `/`.
  - New CLI flags `--discovery` / `--skip-discovery` to control the bundle.

### Patch Changes

- Updated dependencies
  - @agentstxtdev/herald-core@0.2.0
