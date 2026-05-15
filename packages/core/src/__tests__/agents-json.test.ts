import { describe, it, expect } from 'vitest'
import { generateAgentsJson } from '../agents-json.js'
import { validateAgentsJson } from '../validate.js'
import type { AgenticConfig } from '../types.js'

const baseConfig: AgenticConfig = {
  site: { name: 'Test Site', url: 'https://example.com' },
}

// Backing fixtures — required for protocols to be considered "active" (and
// therefore emitted in the payments block). A protocol declared without
// backing is silently dropped, on purpose, so discovery files don't lie.
const x402Backing = {
  x402: { treasury: { evmAddress: '0x1234567890123456789012345678901234567890' } },
} as const
const mppBacking = {
  mpp: { tempoRecipient: '0x1234567890123456789012345678901234567890' },
} as const
const allBacking = { ...x402Backing, ...mppBacking }

// ─────────────────────────────────────────────────────────────────────────────
// Output structure
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — envelope', () => {
  it('always includes version, standard, and site', () => {
    const output = generateAgentsJson(baseConfig)
    const parsed = JSON.parse(output)
    expect(parsed.version).toBe('1.0')
    expect(parsed.standard).toBe('https://agentstxt.dev')
    expect(parsed.site.name).toBe('Test Site')
    expect(parsed.site.url).toBe('https://example.com')
  })

  it('includes site.description when set', () => {
    const config: AgenticConfig = {
      site: { name: 'Test', url: 'https://example.com', description: 'A test site' },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.site.description).toBe('A test site')
  })

  it('omits site.description when not set', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed.site).not.toHaveProperty('description')
  })

  it('output is valid JSON', () => {
    expect(() => JSON.parse(generateAgentsJson(baseConfig))).not.toThrow()
  })

  it('ends with a newline', () => {
    expect(generateAgentsJson(baseConfig).endsWith('\n')).toBe(true)
  })

  it('omits all capability blocks when none configured', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed).not.toHaveProperty('payments')
    expect(parsed).not.toHaveProperty('authorization')
    expect(parsed).not.toHaveProperty('mcp')
    expect(parsed).not.toHaveProperty('skills')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Payments block
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — payments block', () => {
  it('omits payments when no payments config', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed).not.toHaveProperty('payments')
  })

  it('omits payments when protocols list is empty and no backing', () => {
    const config: AgenticConfig = { site: baseConfig.site, payments: { protocols: [] } }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed).not.toHaveProperty('payments')
  })

  it('emits per-protocol blocks and no top-level protocols array', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402', 'mpp'], ...allBacking },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments).not.toHaveProperty('enabled')
    expect(parsed.payments).not.toHaveProperty('protocols')
    expect(parsed.payments).toHaveProperty('x402')
    expect(parsed.payments).toHaveProperty('mpp')
  })

  it('emits mpp.methods reflecting only configured methods', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        protocols: ['mpp'],
        mpp: {
          tempoRecipient: '0x1234567890123456789012345678901234567890',
          stripeSecretKey: 'sk_test_abc',
          stripeNetworkId: 'net_123',
        },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.mpp.methods).toEqual(['tempo', 'stripe'])
  })

  it('lists only tempo in mpp.methods when stripe is unconfigured', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        protocols: ['mpp'],
        mpp: { tempoRecipient: '0x1234567890123456789012345678901234567890' },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.mpp.methods).toEqual(['tempo'])
  })

  it('emits per-protocol description when set on config', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        protocols: ['x402', 'mpp'],
        x402: {
          treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
          description: 'Per-request micropayments for premium API endpoints.',
        },
        mpp: {
          tempoRecipient: '0x1234567890123456789012345678901234567890',
          description: 'Session-based payments via Tempo USDC.',
        },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.x402.description).toBe('Per-request micropayments for premium API endpoints.')
    expect(parsed.payments.mpp.description).toBe('Session-based payments via Tempo USDC.')
  })

  it('omits per-protocol description when not set', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        protocols: ['x402'],
        x402: { treasury: { evmAddress: '0x1234567890123456789012345678901234567890' } },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.x402).not.toHaveProperty('description')
  })

  it('emits payments.required when payments.required is true', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402'], required: true, ...allBacking },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.required).toBe(true)
  })

  it('omits payments.required when not set', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402'], ...allBacking },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments).not.toHaveProperty('required')
  })

  it('drops unbacked protocols and omits payments block when none are active', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402', 'mpp'] }, // no backing
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed).not.toHaveProperty('payments')
  })

  it('drops only the unbacked protocol when one is configured', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402', 'mpp'], ...mppBacking },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments).toHaveProperty('mpp')
    expect(parsed.payments).not.toHaveProperty('x402')
  })

  it('emits both per-protocol blocks when no protocols list is supplied but all backings exist', () => {
    const config: AgenticConfig = { site: baseConfig.site, payments: { ...allBacking } }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments).toHaveProperty('x402')
    expect(parsed.payments).toHaveProperty('mpp')
  })

  it('includes pricing when x402 pricing is configured', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        x402: {
          treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
          pricing: { amount: '0.001', token: 'USDC' },
        },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.pricing).toEqual({ amount: '0.001', currency: 'USDC' })
  })

  it('omits pricing.currency when not set', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        x402: {
          treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
          pricing: { amount: '0.001' },
        },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.pricing.amount).toBe('0.001')
    expect(parsed.payments.pricing).not.toHaveProperty('currency')
  })

  it('includes x402.chains when treasury is configured', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        x402: { treasury: { evmAddress: '0x1234567890123456789012345678901234567890' } },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.x402.chains).toEqual(['eip155:8453'])
  })

  it('uses configured evmChains when set', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        x402: {
          treasury: {
            evmAddress: '0x1234567890123456789012345678901234567890',
            evmChains: ['eip155:1', 'eip155:8453'],
          },
        },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.x402.chains).toEqual(['eip155:1', 'eip155:8453'])
  })

  it('never includes wallet addresses', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        x402: { treasury: { evmAddress: '0x1234567890123456789012345678901234567890' } },
      },
    }
    const output = generateAgentsJson(config)
    expect(output).not.toContain('0x1234567890123456789012345678901234567890')
  })

  it('does NOT emit eip155:8453 when only solanaAddress is set', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        x402: { treasury: { solanaAddress: 'So11111111111111111111111111111111111111112' } },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.x402.chains).toEqual(['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'])
    expect(parsed.payments.x402.chains).not.toContain('eip155:8453')
  })

  it('does NOT emit configured evmChains when evmAddress is absent', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        x402: {
          treasury: {
            solanaAddress: 'So11111111111111111111111111111111111111112',
            evmChains: ['eip155:1', 'eip155:8453'],
          },
        },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.x402.chains).toEqual(['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Authorization block
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — authorization block', () => {
  it('omits authorization when not configured', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed).not.toHaveProperty('authorization')
  })

  it('omits authorization when enabled is false', () => {
    const config: AgenticConfig = { site: baseConfig.site, authorization: { enabled: false } }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed).not.toHaveProperty('authorization')
  })

  it('includes protocols and discovery when enabled', () => {
    const config: AgenticConfig = { site: baseConfig.site, authorization: { enabled: true } }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.authorization.protocols).toEqual(['agent-auth'])
    expect(parsed.authorization.discovery).toBe('/.well-known/agent-configuration')
  })

  it('includes identity: "required" when identityRequired is true', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      authorization: { enabled: true, identityRequired: true },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.authorization.identity).toBe('required')
  })

  it('omits identity when identityRequired is not set', () => {
    const config: AgenticConfig = { site: baseConfig.site, authorization: { enabled: true } }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.authorization).not.toHaveProperty('identity')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MCP block
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — mcp block', () => {
  it('omits mcp when not configured', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed).not.toHaveProperty('mcp')
  })

  it('normalizes a single string endpoint to an array entry with type', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: 'https://example.com/mcp' },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.mcp).toEqual([{ url: 'https://example.com/mcp', type: 'streamable-http' }])
  })

  it('normalizes an array of endpoints to array entries each with type', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: ['https://example.com/mcp', 'https://example.com/mcp-premium'] },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.mcp).toEqual([
      { url: 'https://example.com/mcp', type: 'streamable-http' },
      { url: 'https://example.com/mcp-premium', type: 'streamable-http' },
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Skills block
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — skills block', () => {
  it('omits skills when not configured', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed).not.toHaveProperty('skills')
  })

  it('normalizes a single string URL to { url }', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: { urls: 'https://example.com/skills/main/SKILL.md' },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.skills).toEqual([{ url: 'https://example.com/skills/main/SKILL.md' }])
  })

  it('normalizes an array of string URLs to array of { url } objects', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: {
        urls: [
          'https://example.com/skills/main/SKILL.md',
          'https://example.com/skills/premium/SKILL.md',
        ],
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.skills).toEqual([
      { url: 'https://example.com/skills/main/SKILL.md' },
      { url: 'https://example.com/skills/premium/SKILL.md' },
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A2A block
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — a2a block', () => {
  it('omits a2a when not configured', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed).not.toHaveProperty('a2a')
  })

  it('normalizes a single string URL to { url }', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      a2a: { cards: 'https://example.com/.well-known/agent-card.json' },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.a2a).toEqual([{ url: 'https://example.com/.well-known/agent-card.json' }])
  })

  it('preserves description when entry object is provided', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      a2a: {
        cards: { url: 'https://example.com/.well-known/agent-card.json', description: 'Support agent' },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.a2a).toEqual([
      { url: 'https://example.com/.well-known/agent-card.json', description: 'Support agent' },
    ])
  })

  it('emits multiple AgentCard entries in order', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      a2a: {
        cards: [
          'https://example.com/agents/sales/card.json',
          { url: 'https://example.com/agents/support/card.json', description: 'Support' },
        ],
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.a2a).toEqual([
      { url: 'https://example.com/agents/sales/card.json' },
      { url: 'https://example.com/agents/support/card.json', description: 'Support' },
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AP2 mandate layer
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — ap2 block', () => {
  it('emits payments.ap2 when ap2 config is present, even with no other rail', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { ap2: {} },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments).toHaveProperty('ap2')
    expect(parsed.payments.ap2).toEqual({})
  })

  it('emits presentations, spec, and description when set', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        ap2: {
          presentations: ['sd-jwt-vc'],
          spec: 'https://ap2-protocol.org/specification/v0.1',
          description: 'AP2 mandates accepted alongside x402.',
        },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.ap2.presentations).toEqual(['sd-jwt-vc'])
    expect(parsed.payments.ap2.spec).toBe('https://ap2-protocol.org/specification/v0.1')
    expect(parsed.payments.ap2.description).toBe('AP2 mandates accepted alongside x402.')
  })

  it('composes ap2 alongside x402 when both are configured', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { ...x402Backing, ap2: { presentations: ['sd-jwt-vc'] } },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments).toHaveProperty('x402')
    expect(parsed.payments).toHaveProperty('ap2')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// UCP block
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — ucp block', () => {
  it('omits ucp when not configured', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed).not.toHaveProperty('ucp')
  })

  it('normalizes a single string URL to { url }', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      ucp: { profiles: 'https://example.com/.well-known/ucp' },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.ucp).toEqual([{ url: 'https://example.com/.well-known/ucp' }])
  })

  it('preserves description when entry object is provided', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      ucp: {
        profiles: { url: 'https://example.com/.well-known/ucp', description: 'B2C shopping' },
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.ucp).toEqual([
      { url: 'https://example.com/.well-known/ucp', description: 'B2C shopping' },
    ])
  })

  it('emits multiple UCP profile entries in order', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      ucp: {
        profiles: [
          'https://example.com/.well-known/ucp',
          { url: 'https://example.com/profiles/b2b.json', description: 'B2B' },
        ],
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.ucp).toEqual([
      { url: 'https://example.com/.well-known/ucp' },
      { url: 'https://example.com/profiles/b2b.json', description: 'B2B' },
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Experimental x- protocols
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — experimental x- protocols', () => {
  it('emits an empty object for an x- prefixed protocol key', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x-mypay'] },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments).toEqual({ 'x-mypay': {} })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Full config
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAgentsJson — full config', () => {
  it('includes all four blocks together', () => {
    const config: AgenticConfig = {
      site: { name: 'Full Site', url: 'https://example.com', description: 'Full stack' },
      payments: {
        protocols: ['x402', 'mpp'],
        x402: {
          treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
          pricing: { amount: '0.001', token: 'USDC' },
        },
        mpp: { stripeEnabled: true },
      },
      authorization: { enabled: true, identityRequired: true },
      mcp: { endpoints: 'https://example.com/mcp' },
      skills: {
        urls: [
          'https://example.com/skills/main/SKILL.md',
          'https://example.com/skills/premium/SKILL.md',
        ],
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.site.name).toBe('Full Site')
    expect(parsed.payments).not.toHaveProperty('enabled')
    expect(parsed.payments).not.toHaveProperty('protocols')
    expect(parsed.payments).toHaveProperty('x402')
    expect(parsed.payments.pricing).toEqual({ amount: '0.001', currency: 'USDC' })
    expect(parsed.payments).not.toHaveProperty('mpp')
    expect(parsed.authorization.discovery).toBe('/.well-known/agent-configuration')
    expect(parsed.authorization.identity).toBe('required')
    expect(parsed.mcp[0].type).toBe('streamable-http')
    expect(parsed.skills).toEqual([
      { url: 'https://example.com/skills/main/SKILL.md' },
      { url: 'https://example.com/skills/premium/SKILL.md' },
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

describe('validateAgentsJson', () => {
  it('fails on invalid JSON', () => {
    const results = validateAgentsJson('not json')
    expect(results.find((r) => r.rule === 'json-parseable')?.status).toBe('fail')
  })

  it('passes on minimal valid output', () => {
    const output = generateAgentsJson(baseConfig)
    const results = validateAgentsJson(output)
    expect(results.find((r) => r.rule === 'json-parseable')?.status).toBe('pass')
    expect(results.find((r) => r.rule === 'json-version')?.status).toBe('pass')
    expect(results.find((r) => r.rule === 'json-standard')?.status).toBe('pass')
  })

  describe('$schema field recognition', () => {
    it('passes json-schema-ref when $schema is a string', () => {
      // generateAgentsJson injects $schema by default, so the minimal-config
      // output already exercises the happy path.
      const results = validateAgentsJson(generateAgentsJson(baseConfig))
      const rule = results.find((r) => r.rule === 'json-schema-ref')
      expect(rule?.status).toBe('pass')
      expect(rule?.message).toMatch(/Schema reference present/)
    })

    it('warns when $schema is missing', () => {
      const json = JSON.stringify({ version: '1.0', standard: 'https://agentstxt.dev' })
      const rule = validateAgentsJson(json).find((r) => r.rule === 'json-schema-ref')
      expect(rule?.status).toBe('warn')
      expect(rule?.message).toMatch(/No "\$schema" field/)
    })

    it('warns when $schema is present but not a string', () => {
      const json = JSON.stringify({ $schema: 42, version: '1.0', standard: 'https://agentstxt.dev' })
      const rule = validateAgentsJson(json).find((r) => r.rule === 'json-schema-ref')
      expect(rule?.status).toBe('warn')
      expect(rule?.message).toMatch(/not a string/)
    })
  })

  it('warns on missing version', () => {
    const results = validateAgentsJson(JSON.stringify({ standard: 'https://agentstxt.dev' }))
    expect(results.find((r) => r.rule === 'json-version')?.status).toBe('warn')
  })

  it('fails when payments block has no per-protocol object', () => {
    const json = JSON.stringify({ version: '1.0', standard: 'https://agentstxt.dev', payments: { required: true } })
    const results = validateAgentsJson(json)
    expect(results.find((r) => r.rule === 'json-payments-valid')?.status).toBe('fail')
  })

  it('passes payments validity when at least one per-protocol object is present', () => {
    const json = JSON.stringify({ version: '1.0', standard: 'https://agentstxt.dev', payments: { x402: { chains: ['eip155:8453'] } } })
    const results = validateAgentsJson(json)
    expect(results.find((r) => r.rule === 'json-payments-valid')?.status).toBe('pass')
  })

  it('fails when mpp.methods is present but empty', () => {
    const json = JSON.stringify({ version: '1.0', standard: 'https://agentstxt.dev', payments: { mpp: { methods: [] } } })
    const results = validateAgentsJson(json)
    expect(results.find((r) => r.rule === 'json-mpp-methods')?.status).toBe('fail')
  })

  it('warns on unrecognised mpp.methods entry', () => {
    const json = JSON.stringify({ version: '1.0', standard: 'https://agentstxt.dev', payments: { mpp: { methods: ['tempo', 'lightning'] } } })
    const results = validateAgentsJson(json)
    expect(results.find((r) => r.rule === 'json-mpp-methods-unknown')?.status).toBe('warn')
  })

  it('fails on invalid MCP url', () => {
    const json = JSON.stringify({ mcp: [{ url: 'not-a-url', type: 'streamable-http' }] })
    const results = validateAgentsJson(json)
    expect(results.find((r) => r.rule === 'json-mcp-url-valid')?.status).toBe('fail')
  })

  it('warns on non-https MCP url', () => {
    const json = JSON.stringify({ mcp: [{ url: 'http://example.com/mcp', type: 'streamable-http' }] })
    const results = validateAgentsJson(json)
    expect(results.find((r) => r.rule === 'json-mcp-https')?.status).toBe('warn')
  })

  it('passes all rules on full valid output', () => {
    const config: AgenticConfig = {
      site: { name: 'Test', url: 'https://example.com' },
      payments: { protocols: ['x402'], ...allBacking },
      mcp: { endpoints: 'https://example.com/mcp' },
      skills: { urls: 'https://example.com/skills/main/SKILL.md' },
    }
    const results = validateAgentsJson(generateAgentsJson(config))
    const failures = results.filter((r) => r.status === 'fail')
    expect(failures).toHaveLength(0)
  })
})
