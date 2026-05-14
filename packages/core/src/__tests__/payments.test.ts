import { describe, it, expect } from 'vitest'
import {
  isX402Active,
  isMppActive,
  isAp2Active,
  resolveActiveProtocols,
} from '../payments.js'
import type { PaymentConfig } from '../types.js'

describe('isX402Active', () => {
  it('is true when an EVM address is set', () => {
    expect(isX402Active({ x402: { treasury: { evmAddress: '0x1234' } } } as PaymentConfig)).toBe(true)
  })

  it('is true when a Solana address is set', () => {
    expect(isX402Active({ x402: { treasury: { solanaAddress: 'SoSo' } } } as PaymentConfig)).toBe(true)
  })

  it('is false when neither wallet is set', () => {
    expect(isX402Active({ x402: { treasury: {} } } as PaymentConfig)).toBe(false)
  })

  it('is false when x402 config is absent', () => {
    expect(isX402Active({} as PaymentConfig)).toBe(false)
  })
})

describe('isMppActive', () => {
  it('is true when only tempoRecipient is set', () => {
    expect(isMppActive({ mpp: { tempoRecipient: '0xabc' } } as PaymentConfig)).toBe(true)
  })

  it('is true when both stripeSecretKey AND stripeNetworkId are set', () => {
    expect(isMppActive({ mpp: { stripeSecretKey: 'sk_', stripeNetworkId: 'acct_' } } as PaymentConfig)).toBe(true)
  })

  it('is false when only stripeSecretKey is set (need both Stripe fields)', () => {
    expect(isMppActive({ mpp: { stripeSecretKey: 'sk_' } } as PaymentConfig)).toBe(false)
  })

  it('is false when only stripeNetworkId is set', () => {
    expect(isMppActive({ mpp: { stripeNetworkId: 'acct_' } } as PaymentConfig)).toBe(false)
  })

  it('is false when mpp config is empty', () => {
    expect(isMppActive({ mpp: {} } as PaymentConfig)).toBe(false)
  })

  it('is false when mpp config is absent', () => {
    expect(isMppActive({} as PaymentConfig)).toBe(false)
  })
})

describe('isAp2Active', () => {
  it('is true whenever the ap2 config object is present (even empty)', () => {
    expect(isAp2Active({ ap2: {} } as PaymentConfig)).toBe(true)
  })

  it('is false when ap2 is absent', () => {
    expect(isAp2Active({} as PaymentConfig)).toBe(false)
  })
})

describe('resolveActiveProtocols', () => {
  it('returns an empty list when no protocols are configured', () => {
    expect(resolveActiveProtocols({} as PaymentConfig)).toEqual([])
  })

  it('drops a declared protocol that lacks backing credentials', () => {
    const config: PaymentConfig = { protocols: ['x402'] }
    expect(resolveActiveProtocols(config)).toEqual([])
  })

  it('returns x402 when only x402 is active', () => {
    const config: PaymentConfig = {
      protocols: ['x402'],
      x402: { treasury: { evmAddress: '0xabc' } },
    }
    expect(resolveActiveProtocols(config)).toEqual(['x402'])
  })

  it('preserves user-supplied ordering in protocols[]', () => {
    const config: PaymentConfig = {
      protocols: ['x402', 'mpp'],
      x402: { treasury: { evmAddress: '0x1' } },
      mpp: { tempoRecipient: '0x2' },
    }
    expect(resolveActiveProtocols(config)).toEqual(['x402', 'mpp'])
  })

  it('defaults to [mpp, x402] when protocols[] is omitted', () => {
    const config: PaymentConfig = {
      x402: { treasury: { evmAddress: '0x1' } },
      mpp: { tempoRecipient: '0x2' },
    }
    expect(resolveActiveProtocols(config)).toEqual(['mpp', 'x402'])
  })

  it('passes through x- experimental identifiers verbatim', () => {
    const config: PaymentConfig = {
      protocols: ['x-mypay', 'x402'],
      x402: { treasury: { evmAddress: '0x1' } },
    }
    expect(resolveActiveProtocols(config)).toEqual(['x-mypay', 'x402'])
  })

  it('does NOT add an unconfigured registered protocol just because it was listed', () => {
    const config: PaymentConfig = {
      protocols: ['x402', 'mpp'],
      x402: { treasury: { evmAddress: '0x1' } },
      // mpp config absent → mpp must be dropped
    }
    expect(resolveActiveProtocols(config)).toEqual(['x402'])
  })

  it('appends ap2 when its config is present but the user forgot to list it', () => {
    const config: PaymentConfig = {
      protocols: ['x402'],
      x402: { treasury: { evmAddress: '0x1' } },
      ap2: {},
    }
    expect(resolveActiveProtocols(config)).toContain('ap2')
  })

  it('treats ap2 as active when its config object is present in the defaults branch', () => {
    const config: PaymentConfig = {
      x402: { treasury: { evmAddress: '0x1' } },
      ap2: {},
    }
    expect(resolveActiveProtocols(config)).toContain('ap2')
  })
})
