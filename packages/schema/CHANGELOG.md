# @agentstxtdev/herald-schema

## 0.2.5

### Patch Changes

- Recognize auth-md authorization protocol identifier (WorkOS agentic registration draft). AUTH_PROTOCOLS gains 'auth-md' alongside 'agent-auth' and 'oauth2'; the agents.json Zod schema regex accepts it. Generators, validators, and the CLI Zod schema pick it up automatically.

## 0.2.4

### Patch Changes

- Add WebMCP capability block support (WebMCP: directive, webmcp[] array)

## 0.2.3

### Patch Changes

- Metadata and version-sync release. Align `@agentstxtdev/herald-schema` with the `herald` and `herald-core` 0.2.x version line, and refine the `herald-core` and `herald-schema` package descriptions. No functional code changes since 0.2.2.
