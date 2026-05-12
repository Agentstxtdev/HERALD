import { describe, it, expect } from 'vitest'
import {
  buildAccepts,
  buildPaymentRequired,
  decodePaymentSignature,
  encodePaymentResponse,
  isExemptAgent,
  matchAccepts,
  SOLANA_CAIP2,
  toAtomic,
} from '../x402.js'
import type { X402Config } from '@herald/core'

const evmConfig: X402Config = {
  treasury: { evmAddress: '0x1234567890123456789012345678901234567890', evmChains: ['eip155:8453'] },
  pricing: { amount: '0.001', token: 'USDC' },
}

const solConfig: X402Config = {
  treasury: { solanaAddress: 'So11111111111111111111111111111111111111112', solanaNetwork: 'mainnet-beta' },
  pricing: { amount: '0.001', token: 'USDC' },
}

describe('toAtomic', () => {
  it('converts decimal to atomic with USDC decimals', () => {
    expect(toAtomic('0.001', 6)).toBe('1000')
    expect(toAtomic('1', 6)).toBe('1000000')
    expect(toAtomic('0.01', 2)).toBe('1')
  })
  it('handles whole numbers and zero', () => {
    expect(toAtomic('0', 6)).toBe('0')
    expect(toAtomic('123', 6)).toBe('123000000')
  })
})

describe('isExemptAgent', () => {
  it('case-insensitive substring match', () => {
    expect(isExemptAgent('Googlebot/2.1', ['googlebot'])).toBe(true)
    expect(isExemptAgent('mybot/1.0', ['MyBot'])).toBe(true)
  })
  it('returns false on no match or empty list', () => {
    expect(isExemptAgent('UnknownBot', ['Googlebot'])).toBe(false)
    expect(isExemptAgent('AnyBot', [])).toBe(false)
  })
})

describe('SOLANA_CAIP2', () => {
  it('uses genesis-hash CAIP-2 IDs', () => {
    expect(SOLANA_CAIP2['mainnet-beta']).toMatch(/^solana:/)
    expect(SOLANA_CAIP2['devnet']).toMatch(/^solana:/)
    expect(SOLANA_CAIP2['mainnet-beta']).not.toBe(SOLANA_CAIP2['devnet'])
  })
})

describe('buildAccepts', () => {
  it('produces v2 PaymentRequirements with atomic amount and asset', () => {
    const out = buildAccepts(evmConfig, evmConfig.pricing!)
    expect(out).toHaveLength(1)
    const a = out[0]!
    expect(a.scheme).toBe('exact')
    expect(a.network).toBe('eip155:8453')
    expect(a.amount).toBe('1000')                                // 0.001 USDC = 1000 micro-USDC
    expect(a.asset).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    expect(a.payTo).toBe(evmConfig.treasury.evmAddress)
    expect(a.maxTimeoutSeconds).toBe(60)
    expect(a.extra).toEqual({ name: 'USDC', version: '2' })
  })

  it('emits one entry per evmChains', () => {
    const cfg: X402Config = {
      treasury: { evmAddress: '0xabc', evmChains: ['eip155:8453', 'eip155:1'] },
    }
    const out = buildAccepts(cfg, { amount: '0.01' })
    expect(out.map((a) => a.network)).toEqual(['eip155:8453', 'eip155:1'])
  })

  it('Solana entry has solana:* network and only `name` in extra', () => {
    const out = buildAccepts(solConfig, solConfig.pricing!)
    expect(out[0]!.network).toBe(SOLANA_CAIP2['mainnet-beta'])
    expect(out[0]!.extra).toEqual({ name: 'USDC' })
  })

  it('combines EVM + Solana entries', () => {
    const cfg: X402Config = {
      treasury: {
        evmAddress: '0xabc',
        evmChains: ['eip155:8453'],
        solanaAddress: 'sol1',
        solanaNetwork: 'mainnet-beta',
      },
    }
    const out = buildAccepts(cfg, { amount: '0.001' })
    expect(out).toHaveLength(2)
  })

  it('throws when no treasury address is configured', () => {
    expect(() => buildAccepts({ treasury: {} }, { amount: '0.001' })).toThrow(/no treasury address/)
  })

  it('uses asset override when provided', () => {
    const cfg: X402Config = {
      treasury: { evmAddress: '0xabc', evmChains: ['eip155:8453'] },
      assets: { 'eip155:8453': '0xCUSTOM' },
    }
    const out = buildAccepts(cfg, { amount: '1' })
    expect(out[0]!.asset).toBe('0xCUSTOM')
  })
})

describe('buildPaymentRequired', () => {
  it('emits x402Version 2 and the resource block', () => {
    const accepts = buildAccepts(evmConfig, evmConfig.pricing!)
    const body = buildPaymentRequired({ resourceUrl: 'https://x.com/api', accepts })
    expect(body.x402Version).toBe(2)
    expect(body.resource.url).toBe('https://x.com/api')
    expect(body.accepts).toBe(accepts)
  })
})

describe('decodePaymentSignature / encodePaymentResponse', () => {
  it('round-trips JSON via base64', () => {
    const payload = { x402Version: 2, accepted: { network: 'eip155:8453', amount: '1000' } }
    const encoded = encodePaymentResponse(payload)
    expect(decodePaymentSignature(encoded)).toEqual(payload)
  })
  it('returns null on invalid header', () => {
    expect(decodePaymentSignature(null)).toBeNull()
    expect(decodePaymentSignature('!!!not base64!!!')).toBeNull()
  })
})

describe('matchAccepts', () => {
  it('matches by network + amount', () => {
    const accepts = buildAccepts(evmConfig, evmConfig.pricing!)
    const m = matchAccepts({ accepted: { network: 'eip155:8453', amount: '1000' } }, accepts)
    expect(m).not.toBeNull()
    expect(m!.network).toBe('eip155:8453')
  })
  it('matches by network alone if amount missing', () => {
    const accepts = buildAccepts(evmConfig, evmConfig.pricing!)
    const m = matchAccepts({ accepted: { network: 'eip155:8453' } }, accepts)
    expect(m).not.toBeNull()
  })
  it('returns null on unknown network', () => {
    const accepts = buildAccepts(evmConfig, evmConfig.pricing!)
    const m = matchAccepts({ accepted: { network: 'eip155:999', amount: '1000' } }, accepts)
    expect(m).toBeNull()
  })
})
