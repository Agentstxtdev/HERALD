import { describe, it, expect } from 'vitest'
import { generateSecurityTxt, validateSecurityTxt, SECURITY_GENERATED_MARKER } from '../security.js'
import type { AgenticConfig } from '../types.js'

const baseConfig: AgenticConfig = {
  site: { name: 'Test Site', url: 'https://example.com' },
}

describe('generateSecurityTxt', () => {
  it('returns null when no security block is configured', () => {
    expect(generateSecurityTxt(baseConfig)).toBeNull()
  })

  it('returns null when contact is an empty string or empty array', () => {
    expect(generateSecurityTxt({ ...baseConfig, security: { contact: '' } })).toBeNull()
    expect(generateSecurityTxt({ ...baseConfig, security: { contact: [] } })).toBeNull()
  })

  it('emits a valid RFC 9116 file with the required fields', () => {
    const out = generateSecurityTxt({
      ...baseConfig,
      security: { contact: 'security@example.com' },
    })
    expect(out).not.toBeNull()
    expect(out).toContain(SECURITY_GENERATED_MARKER)
    expect(out).toContain('Contact: mailto:security@example.com')
    expect(out).toMatch(/Expires: \d{4}-\d{2}-\d{2}T00:00:00\.000Z/)
    expect(out).toContain('Canonical: https://example.com/.well-known/security.txt')
  })

  it('prefixes bare email contacts with mailto: but preserves https:/tel:', () => {
    const out = generateSecurityTxt({
      ...baseConfig,
      security: {
        contact: ['security@example.com', 'https://example.com/report', 'tel:+1-555-0100'],
      },
    })!
    expect(out).toContain('Contact: mailto:security@example.com')
    expect(out).toContain('Contact: https://example.com/report')
    expect(out).toContain('Contact: tel:+1-555-0100')
  })

  it('honours an explicit Expires value rather than the 365-day default', () => {
    const out = generateSecurityTxt({
      ...baseConfig,
      security: { contact: 'security@example.com', expires: '2099-01-01T00:00:00.000Z' },
    })!
    expect(out).toContain('Expires: 2099-01-01T00:00:00.000Z')
  })

  it('emits optional Policy / Acknowledgments / Hiring / Encryption when set', () => {
    const out = generateSecurityTxt({
      ...baseConfig,
      security: {
        contact: 'security@example.com',
        policy: 'https://example.com/security-policy',
        acknowledgments: 'https://example.com/hall-of-fame',
        hiring: 'https://example.com/jobs',
        encryption: 'https://example.com/pgp.asc',
        preferredLanguages: ['en', 'es'],
      },
    })!
    expect(out).toContain('Policy: https://example.com/security-policy')
    expect(out).toContain('Acknowledgments: https://example.com/hall-of-fame')
    expect(out).toContain('Hiring: https://example.com/jobs')
    expect(out).toContain('Encryption: https://example.com/pgp.asc')
    expect(out).toContain('Preferred-Languages: en, es')
  })

  it('drops non-URL values for Policy / Acknowledgments / Hiring / Encryption', () => {
    const out = generateSecurityTxt({
      ...baseConfig,
      security: {
        contact: 'security@example.com',
        policy: 'not a url',
        encryption: 'also not a url',
      },
    })!
    expect(out).not.toContain('Policy:')
    expect(out).not.toContain('Encryption:')
  })

  it('uses site.url as the Canonical origin', () => {
    const out = generateSecurityTxt({
      site: { name: 'Other', url: 'https://other.test/' },
      security: { contact: 'sec@other.test' },
    })!
    expect(out).toContain('Canonical: https://other.test/.well-known/security.txt')
  })
})

describe('validateSecurityTxt', () => {
  it('returns no issues for a herald-generated file', () => {
    const out = generateSecurityTxt({
      ...baseConfig,
      security: { contact: 'security@example.com' },
    })!
    expect(validateSecurityTxt(out)).toEqual([])
  })

  it('flags missing Contact', () => {
    const issues = validateSecurityTxt('Expires: 2099-01-01T00:00:00.000Z\n')
    expect(issues.some((i) => i.includes('Contact'))).toBe(true)
  })

  it('flags missing Expires', () => {
    const issues = validateSecurityTxt('Contact: mailto:sec@example.com\n')
    expect(issues.some((i) => i.includes('Expires'))).toBe(true)
  })

  it('flags an expired file', () => {
    const issues = validateSecurityTxt(
      'Contact: mailto:sec@example.com\nExpires: 2000-01-01T00:00:00.000Z\n',
    )
    expect(issues.some((i) => i.includes('expired'))).toBe(true)
  })

  it('flags a malformed Expires value', () => {
    const issues = validateSecurityTxt(
      'Contact: mailto:sec@example.com\nExpires: tomorrow\n',
    )
    expect(issues.some((i) => i.includes('not a valid ISO 8601'))).toBe(true)
  })
})
