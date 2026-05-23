# @agentstxtdev/herald-core

## 0.2.8

### Patch Changes

- Add --minimal flag emitting only the agents.txt §4.6 conformance set (agents.txt + agents.json + \_headers); other selectors still take precedence.

## 0.2.7

### Patch Changes

- Server-card flat-shape compatibility + tools[]; OpenAPI components (Problem, PaginatedList, IdempotencyKey, Cursor, Limit, RateLimit headers, typed responses); API versioning policy.

## 0.2.6

### Patch Changes

- Three new ecosystem discovery generators (x402 well-known, NLWeb schemamap, Web Bot Auth JWKSet) with matching \_headers + Link gates. New crawlers.additionalDirectives for custom robots.txt directives. mcp.serverCard.description support. RFC 9264 api-catalog shape + OpenAPI operationIds + typed 200/402 responses.

## 0.2.5

### Patch Changes

- Recognize auth-md authorization protocol identifier (WorkOS agentic registration draft). AUTH_PROTOCOLS gains 'auth-md' alongside 'agent-auth' and 'oauth2'; the agents.json Zod schema regex accepts it. Generators, validators, and the CLI Zod schema pick it up automatically.

## 0.2.4

### Patch Changes

- Add WebMCP capability block support (WebMCP: directive, webmcp[] array)

## 0.2.3

### Patch Changes

- Metadata and version-sync release. Align `@agentstxtdev/herald-schema` with the `herald` and `herald-core` 0.2.x version line, and refine the `herald-core` and `herald-schema` package descriptions. No functional code changes since 0.2.2.

## 0.2.2

### Patch Changes

- Inject `$schema` field into emitted `agents.json` pointing at the canonical JSON Schema at https://agents-txt.com/schema/agents-json/v1.0.json; add `headersExtras` field on `AgenticConfig` so adopters can declare additional `_headers` / `vercel.json` rules verbatim; recognise `$schema` in `validateAgentsJson` via a new `json-schema-ref` rule. Companion package `@agentstxtdev/herald-schema` published alongside as the Zod source of truth and JSON Schema derivation for the wire format.

## 0.2.1

### Patch Changes

- Routine patch release.

## 0.2.0

### Minor Changes

- - Add four new discovery generators: `generateApiCatalog` (RFC 9727),
    `generateMcpServerCard` (SEP-2127), `generateAgentSkillsIndex`
    (Cloudflare RFC v0.2.0), `generateOpenApiJson` (Payment Discovery draft). - Extend `McpConfig` with `serverCard?`, `SkillEntry` with `name? / type? /
digest?`, `PaymentConfig` with `openapi?`. - Generate matching `_headers` entries (CORS for the new well-known paths)
    and RFC 8288 `Link:` headers on `/`. - New CLI flags `--discovery` / `--skip-discovery` to control the bundle.
