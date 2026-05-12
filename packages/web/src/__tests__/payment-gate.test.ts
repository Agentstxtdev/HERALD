import { describe, it, expect } from 'vitest'
import { gateRequest } from '../payment-gate.js'
import type { AgenticConfig } from '@herald/core'

const baseConfig: AgenticConfig = {
  site: { name: 'Test', url: 'https://x.com' },
  payments: {
    protocols: ['x402'],
    x402: {
      treasury: { evmAddress: '0xabc', evmChains: ['eip155:8453'] },
      pricing: { amount: '0.001', token: 'USDC' },
    },
    exemptUserAgents: ['MyBot'],
  },
}

function freshConfig(): AgenticConfig {
  return JSON.parse(JSON.stringify(baseConfig)) as AgenticConfig
}

describe('gateRequest', () => {
  it('passes through when no payments config', async () => {
    const cfg: AgenticConfig = { site: baseConfig.site }
    const req = new Request('https://x.com/api/foo')
    const out = await gateRequest(req, { config: cfg, pathPrefix: '/api' })
    expect(out.kind).toBe('pass')
  })

  it('passes through for exempt user-agent', async () => {
    const req = new Request('https://x.com/api/foo', { headers: { 'user-agent': 'MyBot/1.0' } })
    const out = await gateRequest(req, { config: freshConfig(), pathPrefix: '/api' })
    expect(out.kind).toBe('pass')
  })

  it('issues a 402 with x402 v2 accepts when no payment header is present', async () => {
    const req = new Request('https://x.com/api/foo')
    const out = await gateRequest(req, { config: freshConfig(), pathPrefix: '/api' })
    expect(out.kind).toBe('respond')
    if (out.kind !== 'respond') return
    expect(out.response.status).toBe(402)
    const body = (await out.response.json()) as { x402Version: number; accepts: unknown[] }
    expect(body.x402Version).toBe(2)
    expect(body.accepts).toHaveLength(1)
  })

  it('returns 400 on malformed PAYMENT-SIGNATURE', async () => {
    const req = new Request('https://x.com/api/foo', {
      headers: { 'PAYMENT-SIGNATURE': 'not-base64-json' },
    })
    const out = await gateRequest(req, { config: freshConfig(), pathPrefix: '/api' })
    expect(out.kind).toBe('respond')
    if (out.kind !== 'respond') return
    expect(out.response.status).toBe(400)
  })

  it('returns 400 when accepted network does not match accepts[]', async () => {
    const payload = { x402Version: 2, accepted: { network: 'eip155:999', amount: '1000' } }
    const sig = Buffer.from(JSON.stringify(payload)).toString('base64')
    const req = new Request('https://x.com/api/foo', { headers: { 'PAYMENT-SIGNATURE': sig } })
    const out = await gateRequest(req, { config: freshConfig(), pathPrefix: '/api' })
    expect(out.kind).toBe('respond')
    if (out.kind !== 'respond') return
    expect(out.response.status).toBe(400)
  })

  it('passes through when protocols listed but no credentials configured', async () => {
    const cfg: AgenticConfig = {
      site: { name: 'Test', url: 'https://x.com' },
      payments: { protocols: ['x402', 'mpp'] }, // no treasury, no mpp creds
    }
    const req = new Request('https://x.com/api/foo')
    const out = await gateRequest(req, { config: cfg, pathPrefix: '/api' })
    expect(out.kind).toBe('pass')
  })
})
