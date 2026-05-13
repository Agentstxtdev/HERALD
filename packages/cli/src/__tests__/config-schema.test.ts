import { describe, it, expect, vi } from 'vitest'
import { AgenticConfigSchema } from '../config-schema.js'

const validMinimal = {
  site: { name: 'My Site', url: 'https://example.com' },
}

const validFull = {
  site: { name: 'My Site', url: 'https://example.com', description: 'A site' },
  content: {
    driver: { type: 'sitemap', sitemapUrl: 'https://example.com/sitemap.xml' },
  },
  crawlers: {
    blockFreeAiScrapers: true,
    allowSearchEngines: true,
    allowPaidAgents: true,
    customRules: [{ userAgent: 'MyBot', allow: ['/public'], disallow: ['/private'] }],
  },
  payments: {
    enabled: true,
    protocols: ['x402', 'mpp'] as const,
    x402: {
      treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
      pricing: { amount: '0.001', token: 'USDC' },
    },
  },
}

describe('AgenticConfigSchema', () => {
  it('accepts a minimal valid config', () => {
    const result = AgenticConfigSchema.safeParse(validMinimal)
    expect(result.success).toBe(true)
  })

  it('accepts a full valid config', () => {
    const result = AgenticConfigSchema.safeParse(validFull)
    expect(result.success).toBe(true)
  })

  it('rejects missing site.name', () => {
    const result = AgenticConfigSchema.safeParse({ site: { url: 'https://example.com' } })
    expect(result.success).toBe(false)
  })

  it('rejects empty site.name', () => {
    const result = AgenticConfigSchema.safeParse({ site: { name: '', url: 'https://example.com' } })
    expect(result.success).toBe(false)
  })

  it('rejects invalid site.url (not a URL)', () => {
    const result = AgenticConfigSchema.safeParse({ site: { name: 'X', url: 'not-a-url' } })
    expect(result.success).toBe(false)
  })

  it('accepts site without description', () => {
    const result = AgenticConfigSchema.safeParse(validMinimal)
    expect(result.success).toBe(true)
  })

  // ── Content drivers ──────────────────────────────────────────────────────────

  it('accepts sitemap driver with valid URL', () => {
    const config = {
      ...validMinimal,
      content: { driver: { type: 'sitemap', sitemapUrl: 'https://example.com/sitemap.xml' } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  it('rejects sitemap driver with invalid sitemapUrl', () => {
    const config = {
      ...validMinimal,
      content: { driver: { type: 'sitemap', sitemapUrl: 'not-a-url' } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  it('accepts firecrawl driver with valid siteUrl and apiKey', () => {
    const config = {
      ...validMinimal,
      content: { driver: { type: 'firecrawl', siteUrl: 'https://example.com', apiKey: 'fc-key' } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  it('rejects firecrawl driver with empty apiKey', () => {
    const config = {
      ...validMinimal,
      content: { driver: { type: 'firecrawl', siteUrl: 'https://example.com', apiKey: '' } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  it('accepts static driver with pages array', () => {
    const config = {
      ...validMinimal,
      content: { driver: { type: 'static', pages: [{ title: 'Home', url: 'https://example.com/' }] } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  it('accepts manual driver with at least one section', () => {
    const config = {
      ...validMinimal,
      content: {
        driver: {
          type: 'manual',
          sections: [{ name: 'Pages', pages: [{ title: 'Home', url: 'https://example.com/' }] }],
        },
      },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  it('rejects manual driver with empty sections array', () => {
    const config = {
      ...validMinimal,
      content: { driver: { type: 'manual', sections: [] } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  // ── Treasury validation ──────────────────────────────────────────────────────

  it('accepts valid EVM address (0x + 40 hex chars)', () => {
    const config = {
      ...validMinimal,
      payments: {
        x402: { treasury: { evmAddress: '0xAbCdEf0123456789012345678901234567890123' } },
      },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  it('rejects EVM address with wrong length', () => {
    const config = {
      ...validMinimal,
      payments: { x402: { treasury: { evmAddress: '0x12345' } } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  it('rejects EVM address without 0x prefix', () => {
    const config = {
      ...validMinimal,
      payments: { x402: { treasury: { evmAddress: '1234567890123456789012345678901234567890' } } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  it('rejects treasury with neither evmAddress nor solanaAddress', () => {
    const config = {
      ...validMinimal,
      payments: { x402: { treasury: {} } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  it('warns and skips malformed evmAddress while keeping a valid solanaAddress', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = {
      ...validMinimal,
      payments: {
        x402: {
          treasury: {
            evmAddress: '0xnotvalid',
            solanaAddress: 'So11111111111111111111111111111111111111112',
          },
        },
      },
    }
    const result = AgenticConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.payments?.x402?.treasury.evmAddress).toBeUndefined()
      expect(result.data.payments?.x402?.treasury.solanaAddress).toBe('So11111111111111111111111111111111111111112')
    }
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns and skips malformed solanaAddress while keeping a valid evmAddress', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = {
      ...validMinimal,
      payments: {
        x402: {
          treasury: {
            evmAddress: '0x1234567890123456789012345678901234567890',
            solanaAddress: 'short',
          },
        },
      },
    }
    const result = AgenticConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.payments?.x402?.treasury.evmAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(result.data.payments?.x402?.treasury.solanaAddress).toBeUndefined()
    }
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('accepts treasury with only solanaAddress', () => {
    const config = {
      ...validMinimal,
      payments: {
        x402: {
          treasury: { solanaAddress: 'So11111111111111111111111111111111111111112' },
        },
      },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  it('accepts treasury with only evmAddress', () => {
    const config = {
      ...validMinimal,
      payments: {
        x402: { treasury: { evmAddress: '0x1234567890123456789012345678901234567890' } },
      },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  it('rejects invalid solana network enum value', () => {
    const config = {
      ...validMinimal,
      payments: {
        x402: {
          treasury: {
            evmAddress: '0x1234567890123456789012345678901234567890',
            solanaNetwork: 'not-a-network',
          },
        },
      },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  it('accepts mainnet-beta as solanaNetwork', () => {
    const config = {
      ...validMinimal,
      payments: {
        x402: {
          treasury: {
            evmAddress: '0x1234567890123456789012345678901234567890',
            solanaNetwork: 'mainnet-beta',
          },
        },
      },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  // ── Pricing validation ───────────────────────────────────────────────────────

  it('rejects pricing amount with non-decimal format', () => {
    const config = {
      ...validMinimal,
      payments: {
        x402: {
          treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
          pricing: { amount: 'free' },
        },
      },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  it('accepts pricing amount as decimal number string', () => {
    const config = {
      ...validMinimal,
      payments: {
        x402: {
          treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
          pricing: { amount: '0.001' },
        },
      },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })

  // ── MPP config ───────────────────────────────────────────────────────────────

  it('warns and skips stripeSecretKey without sk_ prefix instead of failing the whole config', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = {
      ...validMinimal,
      payments: { mpp: { stripeSecretKey: 'pk_test_abc' } },
    }
    const result = AgenticConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.payments?.mpp?.stripeSecretKey).toBeUndefined()
    }
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('accepts stripeSecretKey starting with sk_', () => {
    const config = {
      ...validMinimal,
      payments: { mpp: { stripeSecretKey: 'sk_test_abc123' } },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })


  // ── Protocols ────────────────────────────────────────────────────────────────

  it('rejects invalid protocol value in protocols array', () => {
    const config = {
      ...validMinimal,
      payments: { protocols: ['x402', 'invalid-protocol'] },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(false)
  })

  it('accepts x402 and mpp as valid protocol values', () => {
    const config = {
      ...validMinimal,
      payments: { protocols: ['x402', 'mpp'] },
    }
    expect(AgenticConfigSchema.safeParse(config).success).toBe(true)
  })
})
