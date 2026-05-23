import { describe, it, expect } from 'vitest'
import {
  PAYMENT_PROTOCOLS,
  AUTH_PROTOCOLS,
  MPP_METHODS,
  isExperimentalIdentifier,
  isKnownPaymentProtocol,
  isKnownAuthProtocol,
  isAcceptedPaymentIdentifier,
  isAcceptedAuthIdentifier,
} from '../protocols.js'

describe('registry shape', () => {
  it('PAYMENT_PROTOCOLS matches the spec-registered set', () => {
    expect(PAYMENT_PROTOCOLS).toEqual(['x402', 'mpp', 'ap2'])
  })

  it('AUTH_PROTOCOLS matches the spec-registered set', () => {
    expect(AUTH_PROTOCOLS).toEqual(['agent-auth', 'oauth2', 'auth-md'])
  })

  it('MPP_METHODS matches the recognised method set', () => {
    expect(MPP_METHODS).toEqual(['tempo', 'stripe'])
  })
})

describe('isExperimentalIdentifier', () => {
  it('accepts x- with at least one identifier char', () => {
    expect(isExperimentalIdentifier('x-mypay')).toBe(true)
    expect(isExperimentalIdentifier('x-a')).toBe(true)
  })

  it('rejects bare x-', () => {
    expect(isExperimentalIdentifier('x-')).toBe(false)
  })

  it('rejects non-x prefixed values', () => {
    expect(isExperimentalIdentifier('mypay')).toBe(false)
    expect(isExperimentalIdentifier('')).toBe(false)
  })

  it('is case-sensitive — X- is NOT experimental', () => {
    expect(isExperimentalIdentifier('X-mypay')).toBe(false)
  })
})

describe('isKnown* and isAccepted*', () => {
  it('every PAYMENT_PROTOCOLS entry isKnownPaymentProtocol', () => {
    for (const id of PAYMENT_PROTOCOLS) expect(isKnownPaymentProtocol(id)).toBe(true)
  })

  it('every AUTH_PROTOCOLS entry isKnownAuthProtocol', () => {
    for (const id of AUTH_PROTOCOLS) expect(isKnownAuthProtocol(id)).toBe(true)
  })

  it('isAcceptedPaymentIdentifier admits both registered and x- prefixed forms', () => {
    expect(isAcceptedPaymentIdentifier('x402')).toBe(true)
    expect(isAcceptedPaymentIdentifier('x-mypay')).toBe(true)
    expect(isAcceptedPaymentIdentifier('paypal')).toBe(false)
    expect(isAcceptedPaymentIdentifier('x-')).toBe(false)
  })

  it('isAcceptedAuthIdentifier admits both registered and x- prefixed forms', () => {
    expect(isAcceptedAuthIdentifier('oauth2')).toBe(true)
    expect(isAcceptedAuthIdentifier('x-zk-auth')).toBe(true)
    expect(isAcceptedAuthIdentifier('basic')).toBe(false)
  })
})
