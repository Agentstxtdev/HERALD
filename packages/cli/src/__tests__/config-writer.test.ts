import { describe, it, expect } from 'vitest'
import { s, buildAgenticConfigContent } from '../config-writer.js'
import type { AgenticConfigChoices } from '../config-writer.js'

const minimalChoices: AgenticConfigChoices = {
  siteName: 'My Site',
  siteUrl: 'https://example.com',
  description: 'A great site',
  framework: 'unknown',
  content: { type: 'sitemap', sitemapUrl: 'https://example.com/sitemap.xml' },
}

// ── s() helper ────────────────────────────────────────────────────────────────

describe('s()', () => {
  it('wraps strings in double quotes', () => {
    expect(s('hello')).toBe('"hello"')
  })

  it('escapes double quotes inside the string', () => {
    expect(s('say "hello"')).toBe('"say \\"hello\\""')
  })

  it('escapes backslashes', () => {
    expect(s('path\\to\\file')).toBe('"path\\\\to\\\\file"')
  })

  it('prevents JS injection — escapes closing quote so payload cannot break out of string', () => {
    const malicious = '"; process.exit(1); //'
    const result = s(malicious)
    // The " that would close the template string must be escaped to \"
    expect(result).toContain('\\"')
    // The round-trip must preserve the original value exactly
    expect(JSON.parse(result)).toBe(malicious)
  })

  it('handles empty string', () => {
    expect(s('')).toBe('""')
  })
})

// ── buildAgenticConfigContent ─────────────────────────────────────────────────

describe('buildAgenticConfigContent', () => {
  it('produces a valid JS file starting with // agentic.config.js', () => {
    const output = buildAgenticConfigContent(minimalChoices)
    expect(output.startsWith('// agentic.config.js')).toBe(true)
  })

  it('includes site name, url, and description', () => {
    const output = buildAgenticConfigContent(minimalChoices)
    expect(output).toContain('"My Site"')
    expect(output).toContain('"https://example.com"')
    expect(output).toContain('"A great site"')
  })

  it('includes sitemap driver block for sitemap type', () => {
    const output = buildAgenticConfigContent(minimalChoices)
    expect(output).toContain("type: 'sitemap'")
    expect(output).toContain('"https://example.com/sitemap.xml"')
  })

  it('includes firecrawl driver block for firecrawl type', () => {
    const choices: AgenticConfigChoices = {
      ...minimalChoices,
      content: {
        type: 'firecrawl',
        siteUrl: 'https://example.com',
        firecrawlKey: 'fc-test-key',
      },
    }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain("type: 'firecrawl'")
    expect(output).toContain('"https://example.com"')
    expect(output).toContain('FIRECRAWL_API_KEY')
  })

  it('includes manual driver block for manual type', () => {
    const choices: AgenticConfigChoices = {
      ...minimalChoices,
      content: { type: 'manual', siteUrl: 'https://example.com' },
    }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain("type: 'manual'")
    expect(output).toContain('sections:')
  })

  it('does not include payments block when payments not configured', () => {
    const output = buildAgenticConfigContent(minimalChoices)
    expect(output).not.toContain('payments:')
  })

  it('includes x402 treasury block when x402 protocol enabled with evm address', () => {
    const choices: AgenticConfigChoices = {
      ...minimalChoices,
      payments: {
        protocols: ['x402'],
        x402: {
          evmAddress: '0x1234567890123456789012345678901234567890',
          solanaAddress: '',
          priceAmount: '0.002',
        },
      },
    }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain('payments:')
    expect(output).toContain('x402:')
    expect(output).toContain('"0x1234567890123456789012345678901234567890"')
    expect(output).toContain('"0.002"')
    expect(output).toContain("evmChains: ['eip155:8453']")
  })

  it('includes mpp block when mpp protocol enabled', () => {
    const choices: AgenticConfigChoices = {
      ...minimalChoices,
      payments: {
        protocols: ['mpp'],
        mpp: { tempoRecipient: '0xabc', stripeKey: 'sk_test_abc', stripeNetworkId: 'net_123' },
      },
    }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain('mpp:')
    expect(output).toContain('STRIPE_SECRET_KEY')
    expect(output).toContain('MPP_SECRET_KEY')
    expect(output).toContain('MPP_TEMPO_RECIPIENT')
  })

  it('includes mpp comment when no stripe key provided', () => {
    const choices: AgenticConfigChoices = {
      ...minimalChoices,
      payments: {
        protocols: ['mpp'],
        mpp: { tempoRecipient: '', stripeKey: '', stripeNetworkId: '' },
      },
    }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain('// stripeSecretKey:')
  })

  it('includes both x402 and mpp blocks when both protocols enabled', () => {
    const choices: AgenticConfigChoices = {
      ...minimalChoices,
      payments: {
        protocols: ['x402', 'mpp'],
        x402: { evmAddress: '0x1234567890123456789012345678901234567890', solanaAddress: '', priceAmount: '0.001' },
        mpp: { tempoRecipient: '', stripeKey: '', stripeNetworkId: '' },
      },
    }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain('x402:')
    expect(output).toContain('mpp:')
  })

  it('includes nextjs integration note for nextjs framework', () => {
    const choices: AgenticConfigChoices = { ...minimalChoices, framework: 'nextjs' }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain('Next.js')
  })

  it('includes express integration note for express framework', () => {
    const choices: AgenticConfigChoices = { ...minimalChoices, framework: 'express' }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain('Express')
  })

  it('includes default integration note for unknown framework', () => {
    const output = buildAgenticConfigContent(minimalChoices)
    expect(output).toContain('Static sites')
  })

  it('includes crawlers block with defaults', () => {
    const output = buildAgenticConfigContent(minimalChoices)
    expect(output).toContain('blockFreeAiScrapers: true')
    expect(output).toContain('allowSearchEngines: true')
    expect(output).toContain('allowPaidAgents: true')
  })

  it('includes exemptUserAgents array in payments block', () => {
    const choices: AgenticConfigChoices = {
      ...minimalChoices,
      payments: {
        protocols: ['x402'],
        x402: { evmAddress: '0x1234567890123456789012345678901234567890', solanaAddress: '', priceAmount: '0.001' },
      },
    }
    const output = buildAgenticConfigContent(choices)
    expect(output).toContain('exemptUserAgents: []')
  })
})
