# @agentstxtdev/herald

## 0.2.3

### Patch Changes

- Metadata and version-sync release. Align `@agentstxtdev/herald-schema` with the `herald` and `herald-core` 0.2.x version line, and refine the `herald-core` and `herald-schema` package descriptions. No functional code changes since 0.2.2.
- Updated dependencies
  - @agentstxtdev/herald-core@0.2.3

## 0.2.2

### Patch Changes

- Inject `$schema` field into emitted `agents.json` pointing at the canonical JSON Schema at https://agents-txt.com/schema/agents-json/v1.0.json; add `headersExtras` field on `AgenticConfig` so adopters can declare additional `_headers` / `vercel.json` rules verbatim; recognise `$schema` in `validateAgentsJson` via a new `json-schema-ref` rule. Companion package `@agentstxtdev/herald-schema` published alongside as the Zod source of truth and JSON Schema derivation for the wire format.
- Updated dependencies
  - @agentstxtdev/herald-core@0.2.2

## 0.2.1

### Patch Changes

- Routine patch release.
- Updated dependencies
  - @agentstxtdev/herald-core@0.2.1

## 0.2.0

### Minor Changes

- - Add four new discovery generators: `generateApiCatalog` (RFC 9727),
    `generateMcpServerCard` (SEP-2127), `generateAgentSkillsIndex`
    (Cloudflare RFC v0.2.0), `generateOpenApiJson` (Payment Discovery draft). - Extend `McpConfig` with `serverCard?`, `SkillEntry` with `name? / type? /
digest?`, `PaymentConfig` with `openapi?`. - Generate matching `_headers` entries (CORS for the new well-known paths)
    and RFC 8288 `Link:` headers on `/`. - New CLI flags `--discovery` / `--skip-discovery` to control the bundle.

### Patch Changes

- Updated dependencies
  - @agentstxtdev/herald-core@0.2.0
