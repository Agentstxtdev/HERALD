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
  it('omits payments when not enabled', () => {
    const parsed = JSON.parse(generateAgentsJson(baseConfig))
    expect(parsed).not.toHaveProperty('payments')
  })

  it('omits payments when enabled is false', () => {
    const config: AgenticConfig = { site: baseConfig.site, payments: { enabled: false } }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed).not.toHaveProperty('payments')
  })

  it('includes enabled and protocols when payments is on', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { enabled: true, protocols: ['x402', 'mpp'], ...allBacking },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.enabled).toBe(true)
    expect(parsed.payments.protocols).toEqual(['x402', 'mpp'])
  })

  it('drops unbacked protocols and omits payments block when none are active', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { enabled: true, protocols: ['x402', 'mpp'] }, // no backing
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed).not.toHaveProperty('payments')
  })

  it('drops only the unbacked protocol when one is configured', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { enabled: true, protocols: ['x402', 'mpp'], ...mppBacking },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.protocols).toEqual(['mpp'])
    expect(parsed.payments).not.toHaveProperty('x402')
  })

  it('defaults protocols to [mpp, x402] when not specified', () => {
    const config: AgenticConfig = { site: baseConfig.site, payments: { enabled: true, ...allBacking } }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.payments.protocols).toEqual(['mpp', 'x402'])
  })

  it('includes pricing when x402 pricing is configured', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        enabled: true,
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
        enabled: true,
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
        enabled: true,
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
        enabled: true,
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
        enabled: true,
        x402: { treasury: { evmAddress: '0x1234567890123456789012345678901234567890' } },
      },
    }
    const output = generateAgentsJson(config)
    expect(output).not.toContain('0x1234567890123456789012345678901234567890')
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
      skills: { urls: 'https://example.com/.well-known/skills/main.md' },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.skills).toEqual([{ url: 'https://example.com/.well-known/skills/main.md' }])
  })

  it('normalizes an array of string URLs to array of { url } objects', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: {
        urls: [
          'https://example.com/.well-known/skills/main.md',
          'https://example.com/.well-known/skills/premium.md',
        ],
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.skills).toEqual([
      { url: 'https://example.com/.well-known/skills/main.md' },
      { url: 'https://example.com/.well-known/skills/premium.md' },
    ])
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
        enabled: true,
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
          'https://example.com/.well-known/skills/main.md',
          'https://example.com/.well-known/skills/premium.md',
        ],
      },
    }
    const parsed = JSON.parse(generateAgentsJson(config))
    expect(parsed.site.name).toBe('Full Site')
    expect(parsed.payments.enabled).toBe(true)
    expect(parsed.payments.pricing).toEqual({ amount: '0.001', currency: 'USDC' })
    expect(parsed.payments).not.toHaveProperty('mpp')
    expect(parsed.authorization.discovery).toBe('/.well-known/agent-configuration')
    expect(parsed.authorization.identity).toBe('required')
    expect(parsed.mcp[0].type).toBe('streamable-http')
    expect(parsed.skills).toEqual([
      { url: 'https://example.com/.well-known/skills/main.md' },
      { url: 'https://example.com/.well-known/skills/premium.md' },
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

  it('warns on missing version', () => {
    const results = validateAgentsJson(JSON.stringify({ standard: 'https://agentstxt.dev' }))
    expect(results.find((r) => r.rule === 'json-version')?.status).toBe('warn')
  })

  it('fails when payments.enabled=true but protocols is empty', () => {
    const json = JSON.stringify({ version: '0.4', standard: 'https://agentstxt.dev', payments: { enabled: true, protocols: [] } })
    const results = validateAgentsJson(json)
    expect(results.find((r) => r.rule === 'json-payments-valid')?.status).toBe('fail')
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
      payments: { enabled: true, protocols: ['x402'] },
      mcp: { endpoints: 'https://example.com/mcp' },
      skills: { urls: 'https://example.com/.well-known/skills/main.md' },
    }
    const results = validateAgentsJson(generateAgentsJson(config))
    const failures = results.filter((r) => r.status === 'fail')
    expect(failures).toHaveLength(0)
  })
})
