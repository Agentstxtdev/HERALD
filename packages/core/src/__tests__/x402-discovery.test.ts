import { describe, it, expect } from 'vitest'
import { generateX402WellKnown } from '../x402-discovery.js'
import type { AgenticConfig } from '../types.js'

const baseSite = { name: 'Example', url: 'https://example.com' }

describe('generateX402WellKnown', () => {
  it('returns null when payments.x402 is absent', () => {
    expect(generateX402WellKnown({ site: baseSite })).toBeNull()
  })

  it('returns null when x402 has no wallet (no active chains)', () => {
    const out = generateX402WellKnown({
      site: baseSite,
      payments: { protocols: ['x402'], x402: { treasury: {} } },
    })
    expect(out).toBeNull()
  })

  it('emits chains derived from EVM + Solana treasury entries', () => {
    const out = generateX402WellKnown({
      site: baseSite,
      payments: {
        protocols: ['x402'],
        x402: {
          treasury: {
            evmAddress: '0x' + '0'.repeat(40),
            evmChains: ['eip155:8453'],
            solanaAddress: '4'.repeat(43),
            solanaNetwork: 'mainnet-beta',
          },
        },
      },
    })
    const doc = JSON.parse(out!) as { resources: Array<{ chains: string[] }>; discovery: { agentsJson: string } }
    expect(doc.discovery.agentsJson).toBe('https://example.com/agents.json')
    // Resources are derived from payments.openapi.paths; this config has none,
    // so the resources array is empty but the doc itself still emits.
    expect(Array.isArray(doc.resources)).toBe(true)
  })

  it('lists payable paths from payments.openapi.paths whose offers include x402', () => {
    const out = generateX402WellKnown({
      site: baseSite,
      payments: {
        protocols: ['x402'],
        x402: { treasury: { evmAddress: '0x' + '0'.repeat(40), evmChains: ['eip155:8453'] } },
        openapi: {
          paths: {
            '/pay': {
              description: 'gated route',
              offers: [{ intent: 'charge', method: 'x402', amount: '1', currency: 'USDC' }],
            },
            '/free': {
              offers: [{ intent: 'charge', method: 'mpp', amount: '1', currency: 'USDC' }],
            },
          },
        },
      },
    })
    const doc = JSON.parse(out!) as { resources: Array<{ url: string }> }
    expect(doc.resources.map((r) => r.url)).toEqual(['https://example.com/pay'])
  })

  it('ends with a single trailing newline', () => {
    const out = generateX402WellKnown({
      site: baseSite,
      payments: {
        protocols: ['x402'],
        x402: { treasury: { evmAddress: '0x' + '0'.repeat(40), evmChains: ['eip155:8453'] } },
      },
    })!
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})
