// ─────────────────────────────────────────────────────────────────────────────
// @agentstxtdev/herald-schema — public entrypoint
//
// Exports:
//   - AgentsJsonSchema    — Zod schema (use .parse / .safeParse for runtime validation)
//   - AgentsJson          — TypeScript type derived from the Zod schema
//   - SCHEMA_VERSION      — current wire version (e.g. "1.0")
//   - SCHEMA_ID           — canonical $id / $schema URL on agents-txt.com
//   - toJsonSchema()      — derive a vanilla JSON Schema 2020-12 doc for hosting
//                            or for tooling that expects a static schema file
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'
import { AgentsJsonSchema, SCHEMA_ID, SCHEMA_VERSION } from './agents-json-schema.js'

export { AgentsJsonSchema, SCHEMA_ID, SCHEMA_VERSION }
export type { AgentsJson } from './agents-json-schema.js'

/**
 * Convert the wire-format Zod schema to a vanilla JSON Schema 2020-12 document
 * suitable for hosting at `agents-txt.com/schema/agents-json/v1.0.json` or for
 * use with `$schema` references inside generated `agents.json` files.
 *
 * The returned object is a plain JS object; the caller serializes it.
 */
export function toJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(AgentsJsonSchema, {
    target: 'draft-2020-12',
    reused: 'inline',
  }) as Record<string, unknown>

  // Inject identity + metadata that the Zod-derived schema doesn't carry.
  schema.$id = SCHEMA_ID
  schema.$schema = 'https://json-schema.org/draft/2020-12/schema'
  schema.title = `agents.json v${SCHEMA_VERSION}`
  schema.$comment = `JSON Schema for agents.json (v${SCHEMA_VERSION}). See https://agents-txt.com for the specification.`
  return schema
}

/**
 * Convenience: serialize the JSON Schema to a string with 2-space indent and a
 * trailing newline. Matches the formatting convention herald uses for every
 * other static asset it generates.
 */
export function toJsonSchemaString(): string {
  return JSON.stringify(toJsonSchema(), null, 2) + '\n'
}
