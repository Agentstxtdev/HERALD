import { describe, it, expect } from 'vitest'
import { generateWebBotAuthDirectory } from '../web-bot-auth.js'
import type { AgenticConfig, WebBotAuthKey } from '../types.js'

const baseSite = { name: 'Example', url: 'https://example.com' }
const key1: WebBotAuthKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  x:   'Ckb46yvRcxSfcoimhk60zPGlHk9QVxjLEWIdhd1FwU4',
  kid: 'thumbprint-1',
  nbf: 1700000000,
  exp: 1800000000,
}

describe('generateWebBotAuthDirectory', () => {
  it('returns null when webBotAuth is absent', () => {
    expect(generateWebBotAuthDirectory({ site: baseSite })).toBeNull()
  })

  it('returns null when keys array is empty', () => {
    expect(generateWebBotAuthDirectory({ site: baseSite, webBotAuth: { keys: [] } })).toBeNull()
  })

  it('emits a JWKSet with the published key shape', () => {
    const out = generateWebBotAuthDirectory({ site: baseSite, webBotAuth: { keys: [key1] } })!
    const parsed = JSON.parse(out) as { keys: WebBotAuthKey[] }
    expect(parsed.keys).toHaveLength(1)
    expect(parsed.keys[0]).toMatchObject({
      kty: 'OKP',
      crv: 'Ed25519',
      x:   'Ckb46yvRcxSfcoimhk60zPGlHk9QVxjLEWIdhd1FwU4',
      kid: 'thumbprint-1',
      nbf: 1700000000,
      exp: 1800000000,
    })
  })

  it('defaults alg=EdDSA and use=sig when not supplied', () => {
    const out = generateWebBotAuthDirectory({ site: baseSite, webBotAuth: { keys: [key1] } })!
    const parsed = JSON.parse(out) as { keys: Array<WebBotAuthKey & { alg: string; use: string }> }
    expect(parsed.keys[0]!.alg).toBe('EdDSA')
    expect(parsed.keys[0]!.use).toBe('sig')
  })

  it('passes through caller-supplied alg / use', () => {
    const out = generateWebBotAuthDirectory({
      site: baseSite,
      webBotAuth: { keys: [{ ...key1, alg: 'EdDSA', use: 'sig' }] },
    })!
    const parsed = JSON.parse(out) as { keys: Array<{ alg: string; use: string }> }
    expect(parsed.keys[0]!.alg).toBe('EdDSA')
    expect(parsed.keys[0]!.use).toBe('sig')
  })

  it('rolls multiple keys (rotation: old + new live together until exp)', () => {
    const out = generateWebBotAuthDirectory({
      site: baseSite,
      webBotAuth: {
        keys: [
          { ...key1, kid: 'old', exp: 1750000000 },
          { ...key1, kid: 'new', x: 'XOnotKeyMaterialButValid_', nbf: 1740000000 },
        ],
      },
    })!
    const parsed = JSON.parse(out) as { keys: Array<{ kid: string }> }
    expect(parsed.keys.map((k) => k.kid)).toEqual(['old', 'new'])
  })

  it('ends with a single trailing newline', () => {
    const out = generateWebBotAuthDirectory({ site: baseSite, webBotAuth: { keys: [key1] } })!
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})
