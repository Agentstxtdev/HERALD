// Round-trip test: every shape the herald-core `generateAgentsJson` generator
// can emit must validate cleanly against `AgentsJsonSchema`. This is the
// integration contract between herald-core (the producer) and herald-schema
// (the spec authority). If a future generator change emits a field the schema
// doesn't model, this test fails.

import { describe, it, expect } from 'vitest'
import { generateAgentsJson } from '@agentstxtdev/herald-core'
import type { AgenticConfig } from '@agentstxtdev/herald-core'
import { AgentsJsonSchema } from '../index.js'

function parsedOutput(config: AgenticConfig) {
  return JSON.parse(generateAgentsJson(config))
}

describe('herald-core ↔ herald-schema round-trip', () => {
  it('minimal config produces a document that validates', () => {
    const config: AgenticConfig = { site: { name: 'X', url: 'https://example.com' } }
    expect(AgentsJsonSchema.safeParse(parsedOutput(config)).success).toBe(true)
  })

  it('full config (all capability blocks active) produces a valid document', () => {
    const config: AgenticConfig = {
      site: { name: 'Example', url: 'https://example.com', description: 'demo' },
      payments: {
        protocols: ['x402', 'mpp', 'ap2'],
        x402: {
          treasury: { evmAddress: '0xabc', evmChains: ['eip155:8453'] },
          pricing: { amount: '10000', token: 'USDC' },
          description: 'demo charge',
        },
        mpp: {
          tempoRecipient: '0xtempo',
          stripeSecretKey: 'sk_test',
          stripeNetworkId: 'acct_x',
          pricing: { amount: '0.01', token: 'USD' },
        },
        ap2: { presentations: ['sd-jwt-vc'], spec: 'https://ap2-protocol.org/v0.1' },
        required: true,
      },
      authorization: { enabled: true, protocols: ['agent-auth', 'oauth2'], identityRequired: true },
      mcp: { endpoints: [{ url: 'https://example.com/mcp', description: 'main' }] },
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', description: 'demo' }] },
      a2a: { cards: [{ url: 'https://example.com/.well-known/agent-card.json' }] },
      ucp: { profiles: [{ url: 'https://example.com/.well-known/ucp.json' }] },
    }
    const result = AgentsJsonSchema.safeParse(parsedOutput(config))
    if (!result.success) {
      // Surface the issue list for debugging when the generator drifts from the schema.
      console.error(JSON.stringify(result.error.issues, null, 2))
    }
    expect(result.success).toBe(true)
  })

  it('the generator emits $schema pointing at the canonical hosted URL', () => {
    const config: AgenticConfig = { site: { name: 'X', url: 'https://example.com' } }
    expect(parsedOutput(config).$schema).toBe('https://agentstxt.dev/schema/agents-json/v1.0.json')
  })

  it('experimental protocols in config flow through and validate', () => {
    const config: AgenticConfig = {
      site: { name: 'X', url: 'https://example.com' },
      payments: {
        protocols: ['x402', 'x-mypay'],
        x402: { treasury: { evmAddress: '0xabc' } },
      },
    }
    const parsed = parsedOutput(config)
    expect(parsed.payments).toHaveProperty('x-mypay')
    expect(AgentsJsonSchema.safeParse(parsed).success).toBe(true)
  })
})
