// ─────────────────────────────────────────────────────────────────────────────
// Tests for the Zod wire-format schema and its derived JSON Schema.
//
// Two surfaces under test:
//   - AgentsJsonSchema.safeParse(): runtime validation a third-party validator
//     would do against a served agents.json.
//   - toJsonSchema(): the JSON Schema document hosted on agents-txt.com. We
//     don't run a full JSON Schema validator round-trip here (that would add
//     a runtime dep); we assert the shape and identity fields that downstream
//     editors actually read.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  AgentsJsonSchema,
  SCHEMA_ID,
  SCHEMA_VERSION,
  toJsonSchema,
  toJsonSchemaString,
} from '../index.js'

const minimalValid = {
  version: '1.0',
  standard: 'https://agents-txt.com',
  site: { name: 'Example', url: 'https://example.com' },
}

describe('AgentsJsonSchema — minimal valid documents', () => {
  it('accepts the smallest legal document', () => {
    const result = AgentsJsonSchema.safeParse(minimalValid)
    expect(result.success).toBe(true)
  })

  it('accepts an optional $schema field pointing at the canonical URL', () => {
    const result = AgentsJsonSchema.safeParse({ ...minimalValid, $schema: SCHEMA_ID })
    expect(result.success).toBe(true)
  })

  it('accepts a description on the site block', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      site: { ...minimalValid.site, description: 'Demo site.' },
    })
    expect(result.success).toBe(true)
  })
})

describe('AgentsJsonSchema — required field rejections', () => {
  it('rejects a document missing version', () => {
    const { version: _v, ...rest } = minimalValid
    expect(AgentsJsonSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects a non-numeric version string', () => {
    const result = AgentsJsonSchema.safeParse({ ...minimalValid, version: 'v1-beta' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-https standard URL', () => {
    const result = AgentsJsonSchema.safeParse({ ...minimalValid, standard: 'agents-txt.com' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty site.name', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      site: { name: '', url: 'https://example.com' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed site.url', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      site: { name: 'X', url: 'not-a-url' },
    })
    expect(result.success).toBe(false)
  })
})

describe('AgentsJsonSchema — payments block', () => {
  it('accepts a payments block with x402 only', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { x402: { chains: ['eip155:8453'] } },
    })
    expect(result.success).toBe(true)
  })

  it('accepts a payments block with all three registered protocols', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: {
        x402: { chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'] },
        mpp:   { methods: ['tempo', 'stripe'] },
        ap2:   { presentations: ['sd-jwt-vc'] },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts an x- experimental key in payments', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { 'x-mypay': { detail: 'experimental' }, x402: { chains: ['eip155:8453'] } },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown non-x payments key', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { paypal: {}, x402: { chains: ['eip155:8453'] } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a payments block with no per-protocol key (only pricing)', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { pricing: { amount: '0.01', currency: 'USDC' } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty chains[] in x402', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { x402: { chains: [] } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed CAIP-2 chain identifier', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { x402: { chains: ['8453'] } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unrecognised MPP method', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { mpp: { methods: ['paypal' as unknown as 'tempo'] } },
    })
    expect(result.success).toBe(false)
  })

  it('accepts payments.required = true', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { x402: { chains: ['eip155:8453'] }, required: true },
    })
    expect(result.success).toBe(true)
  })

  it('rejects payments.required = false (must be literal true when present)', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      payments: { x402: { chains: ['eip155:8453'] }, required: false as unknown as true },
    })
    expect(result.success).toBe(false)
  })
})

describe('AgentsJsonSchema — capability arrays', () => {
  it('accepts a single MCP endpoint', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      mcp: [{ url: 'https://example.com/mcp', type: 'streamable-http' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an MCP entry without type', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      mcp: [{ url: 'https://example.com/mcp' }] as unknown,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an MCP entry with type != "streamable-http"', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      mcp: [{ url: 'https://example.com/mcp', type: 'sse' as unknown as 'streamable-http' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts skills, a2a, ucp arrays with url + optional description', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      skills: [{ url: 'https://example.com/skills/foo/SKILL.md' }],
      a2a:    [{ url: 'https://example.com/.well-known/agent-card.json', description: 'demo agent' }],
      ucp:    [{ url: 'https://example.com/.well-known/ucp.json' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-https skills URL', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      skills: [{ url: 'ftp://example.com/skill.md' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('AgentsJsonSchema — authorization block', () => {
  it('accepts both registered auth protocols', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      authorization: { protocols: ['agent-auth', 'oauth2'], discovery: '/.well-known/agent-configuration' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown non-x auth protocol', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      authorization: { protocols: ['basic'], discovery: '/.well-known/agent-configuration' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts an x- experimental auth protocol', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      authorization: { protocols: ['x-zero-knowledge'], discovery: '/.well-known/agent-configuration' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects a relative discovery path that does not start with /', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      authorization: { protocols: ['agent-auth'], discovery: 'well-known/agent-configuration' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects identity != "required"', () => {
    const result = AgentsJsonSchema.safeParse({
      ...minimalValid,
      authorization: {
        protocols: ['agent-auth'],
        discovery: '/.well-known/agent-configuration',
        identity: 'optional' as unknown as 'required',
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('SCHEMA_ID / SCHEMA_VERSION', () => {
  it('exports the canonical version', () => {
    expect(SCHEMA_VERSION).toBe('1.0')
  })

  it('exports the canonical schema URL', () => {
    expect(SCHEMA_ID).toBe('https://agents-txt.com/schema/agents-json/v1.0.json')
  })
})

describe('toJsonSchema()', () => {
  const schema = toJsonSchema()

  it('returns a JSON Schema 2020-12 document', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
  })

  it('sets $id to the canonical hosted URL', () => {
    expect(schema.$id).toBe(SCHEMA_ID)
  })

  it('declares the document title with version', () => {
    expect(schema.title).toBe(`agents.json v${SCHEMA_VERSION}`)
  })

  it('describes an object with at least version + standard + site as required', () => {
    expect(schema.type).toBe('object')
    const required = schema.required as string[]
    expect(required).toEqual(expect.arrayContaining(['version', 'standard', 'site']))
  })

  it('exposes the four capability arrays as optional object properties', () => {
    const props = schema.properties as Record<string, unknown>
    for (const key of ['mcp', 'skills', 'a2a', 'ucp']) {
      expect(props).toHaveProperty(key)
    }
  })
})

describe('toJsonSchemaString()', () => {
  it('produces parseable JSON', () => {
    expect(() => JSON.parse(toJsonSchemaString())).not.toThrow()
  })

  it('ends with a single trailing newline', () => {
    const out = toJsonSchemaString()
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })

  it('round-trips: parsed output equals the schema returned by toJsonSchema()', () => {
    expect(JSON.parse(toJsonSchemaString())).toEqual(toJsonSchema())
  })
})
