import { describe, it, expect } from 'vitest'
import { createMppxRuntime, pickMppPricing } from '../mpp.js'
import type { MppConfig } from '@agentify/core'

describe('pickMppPricing', () => {
  it('uses default pricing when no perPath match', () => {
    const cfg: MppConfig = { pricing: { amount: '0.01' } }
    const out = pickMppPricing(cfg, '/api/foo', '/api')
    expect(out.tempoAmount).toBe('10000')   // 0.01 USDC = 10000 micro-USDC
    expect(out.stripeAmount).toBe('1')      // 0.01 USD = 1 cent
  })

  it('selects perPath override when path matches', () => {
    const cfg: MppConfig = {
      pricing: { amount: '0.01' },
      perPath: { '/premium': { amount: '1' } },
    }
    const out = pickMppPricing(cfg, '/api/premium', '/api')
    expect(out.tempoAmount).toBe('1000000')
    expect(out.stripeAmount).toBe('100')
  })

  it('falls back to amount=1 when neither default nor match', () => {
    const out = pickMppPricing({}, '/api/foo', '/api')
    expect(out.tempoAmount).toBe('1000000')   // 1 USDC = 10^6 micro-USDC
    expect(out.stripeAmount).toBe('100')      // 1 USD = 100 cents
  })
})

describe('createMppxRuntime', () => {
  it('returns ready=false when mppx is not installed', async () => {
    const rt = await createMppxRuntime({}, 'test-realm')
    expect(rt.ready).toBe(false)
  })

  it('returns ready=false when no payment methods configured', async () => {
    const rt = await createMppxRuntime({ tempoEnabled: false, stripeEnabled: false }, 'test-realm')
    expect(rt.ready).toBe(false)
  })
})
