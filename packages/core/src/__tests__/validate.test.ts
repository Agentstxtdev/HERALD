import { describe, it, expect } from 'vitest'
import { validateRobotsTxt, validateLlmsTxt, validateAgentsTxt, validateSitemapXml } from '../validate.js'
import { FREE_AI_SCRAPERS } from '../robots.js'
import type { AgenticConfig } from '../types.js'

// ── validateRobotsTxt ─────────────────────────────────────────────────────────

describe('validateRobotsTxt', () => {
  it('passes ai-blocklist when all known AI scrapers are present', () => {
    const content = FREE_AI_SCRAPERS.join('\n') + '\nllms.txt'
    const results = validateRobotsTxt(content)
    const rule = results.find((r) => r.rule === 'ai-blocklist')
    expect(rule?.status).toBe('pass')
  })

  it('warns ai-blocklist when some scrapers are missing', () => {
    const partial = FREE_AI_SCRAPERS.slice(0, 3).join('\n') + '\nllms.txt'
    const results = validateRobotsTxt(partial)
    const rule = results.find((r) => r.rule === 'ai-blocklist')
    expect(rule?.status).toBe('warn')
    expect(rule?.message).toContain('Partial AI blocklist')
  })

  it('warns ai-blocklist when no scraper is found', () => {
    const results = validateRobotsTxt('User-agent: *\nAllow: /\nllms.txt')
    const rule = results.find((r) => r.rule === 'ai-blocklist')
    expect(rule?.status).toBe('warn')
    expect(rule?.message).toContain('No known AI scraper blocklist')
  })

  it('skips ai-blocklist check when blockFreeAiScrapers is false in config', () => {
    const config: AgenticConfig = {
      site: { name: 'X', url: 'https://example.com' },
      crawlers: { blockFreeAiScrapers: false },
    }
    const results = validateRobotsTxt('User-agent: *\nAllow: /', config)
    const rule = results.find((r) => r.rule === 'ai-blocklist')
    expect(rule).toBeUndefined()
  })

  it('passes llms-ref when llms.txt reference is present', () => {
    const content = 'User-agent: *\n# llms.txt: https://example.com/llms.txt'
    const results = validateRobotsTxt(content)
    const rule = results.find((r) => r.rule === 'llms-ref')
    expect(rule?.status).toBe('pass')
  })

  it('warns llms-ref when no llms.txt reference', () => {
    const content = FREE_AI_SCRAPERS.join('\n')
    const results = validateRobotsTxt(content)
    const rule = results.find((r) => r.rule === 'llms-ref')
    expect(rule?.status).toBe('warn')
  })

  it('returns a ValidationResult array with rule, status, and message fields', () => {
    const results = validateRobotsTxt('User-agent: *\nllms.txt')
    for (const r of results) {
      expect(r).toHaveProperty('rule')
      expect(r).toHaveProperty('status')
      expect(r).toHaveProperty('message')
    }
  })
})

// ── validateLlmsTxt ───────────────────────────────────────────────────────────

describe('validateLlmsTxt', () => {
  it('passes h1-title when content starts with #', () => {
    const results = validateLlmsTxt('# My Site\n\n## Pages\n')
    const rule = results.find((r) => r.rule === 'h1-title')
    expect(rule?.status).toBe('pass')
  })

  it('fails h1-title when content does not start with #', () => {
    const results = validateLlmsTxt('My Site\n\n## Pages\n')
    const rule = results.find((r) => r.rule === 'h1-title')
    expect(rule?.status).toBe('fail')
    expect(rule?.message).toContain('Missing required H1 title')
  })

  it('passes sections when ## headings are present', () => {
    const results = validateLlmsTxt('# Site\n\n## Pages\n- [Home](https://example.com)\n')
    const rule = results.find((r) => r.rule === 'sections')
    expect(rule?.status).toBe('pass')
  })

  it('warns sections when no ## headings found', () => {
    const results = validateLlmsTxt('# Site\n\nSome prose.\n')
    const rule = results.find((r) => r.rule === 'sections')
    expect(rule?.status).toBe('warn')
  })
})

// ── validateAgentsTxt ─────────────────────────────────────────────────────────

describe('validateAgentsTxt', () => {
  it('passes standard-header when # agents.txt is present', () => {
    const results = validateAgentsTxt('# agents.txt\n# Standard: https://agents-txt.com\n')
    const rule = results.find((r) => r.rule === 'standard-header')
    expect(rule?.status).toBe('pass')
  })

  it('warns standard-header when # agents.txt is missing', () => {
    const results = validateAgentsTxt('Protocols: x402\n')
    const rule = results.find((r) => r.rule === 'standard-header')
    expect(rule?.status).toBe('warn')
    expect(rule?.message).toContain('Missing')
  })

  it('returns only standard-header when no Protocols: line', () => {
    const results = validateAgentsTxt('# agents.txt\n')
    expect(results).toHaveLength(1)
    expect(results[0]?.rule).toBe('standard-header')
  })

  it('passes protocols-valid for x402', () => {
    const content = '# agents.txt\nProtocols: x402\n'
    const results = validateAgentsTxt(content)
    const rule = results.find((r) => r.rule === 'protocols-valid')
    expect(rule?.status).toBe('pass')
    expect(rule?.message).toContain('x402')
  })

  it('passes protocols-valid for mpp', () => {
    const content = '# agents.txt\nProtocols: mpp\n'
    const results = validateAgentsTxt(content)
    const rule = results.find((r) => r.rule === 'protocols-valid')
    expect(rule?.status).toBe('pass')
  })

  it('passes protocols-valid for x402 and mpp together', () => {
    const content = '# agents.txt\nProtocols: x402, mpp\n'
    const results = validateAgentsTxt(content)
    const rule = results.find((r) => r.rule === 'protocols-valid')
    expect(rule?.status).toBe('pass')
    expect(rule?.message).toContain('x402')
    expect(rule?.message).toContain('mpp')
  })

  it('passes protocols-valid for x- prefixed experimental identifiers', () => {
    const content = '# agents.txt\nProtocols: x-mypay, x-otherpay\n'
    const results = validateAgentsTxt(content)
    const rule = results.find((r) => r.rule === 'protocols-valid')
    expect(rule?.status).toBe('pass')
    expect(rule?.message).toContain('x-mypay')
  })

  it('does not warn on x- prefixed experimental identifiers', () => {
    const content = '# agents.txt\nProtocols: x402, x-future\n'
    const results = validateAgentsTxt(content)
    const unknown = results.find((r) => r.rule === 'unknown-protocols')
    expect(unknown).toBeUndefined()
  })

  it('fails protocols-valid when only unknown protocols listed', () => {
    const content = '# agents.txt\nProtocols: unknown-proto\n'
    const results = validateAgentsTxt(content)
    const rule = results.find((r) => r.rule === 'protocols-valid')
    expect(rule?.status).toBe('fail')
  })

  it('warns unknown-protocols for unrecognised protocol names', () => {
    const content = '# agents.txt\nProtocols: x402, future-proto\n'
    const results = validateAgentsTxt(content)
    const rule = results.find((r) => r.rule === 'unknown-protocols')
    expect(rule?.status).toBe('warn')
    expect(rule?.message).toContain('future-proto')
  })

  it('does not emit unknown-protocols when all protocols are known', () => {
    const content = '# agents.txt\nProtocols: x402, mpp\n'
    const results = validateAgentsTxt(content)
    const rule = results.find((r) => r.rule === 'unknown-protocols')
    expect(rule).toBeUndefined()
  })

  it('returns a ValidationResult array with rule, status, and message fields', () => {
    const results = validateAgentsTxt('# agents.txt\nProtocols: x402\n')
    for (const r of results) {
      expect(r).toHaveProperty('rule')
      expect(r).toHaveProperty('status')
      expect(r).toHaveProperty('message')
    }
  })
})

// ── validateSitemapXml ────────────────────────────────────────────────────────

const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const wrapUrlset = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n${body}\n</urlset>\n`

describe('validateSitemapXml', () => {
  it('fails when there is no <urlset> or <sitemapindex> root', () => {
    const r = validateSitemapXml('<foo/>')
    expect(r.find((x) => x.rule === 'sitemap-root')?.status).toBe('fail')
  })

  it('passes root + namespace for a minimal urlset', () => {
    const r = validateSitemapXml(wrapUrlset('<url><loc>https://example.com/</loc></url>'))
    expect(r.find((x) => x.rule === 'sitemap-root')?.status).toBe('pass')
    expect(r.find((x) => x.rule === 'sitemap-namespace')?.status).toBe('pass')
  })

  it('fails when xmlns is missing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n<url><loc>https://example.com/</loc></url>\n</urlset>`
    const r = validateSitemapXml(xml)
    expect(r.find((x) => x.rule === 'sitemap-namespace')?.status).toBe('fail')
  })

  it('fails when a <url> is missing <loc>', () => {
    const r = validateSitemapXml(wrapUrlset('<url><lastmod>2026-05-08</lastmod></url>'))
    expect(r.find((x) => x.rule === 'sitemap-url-loc-required')?.status).toBe('fail')
  })

  it('warns on empty urlset', () => {
    const r = validateSitemapXml(wrapUrlset(''))
    expect(r.find((x) => x.rule === 'sitemap-urls')?.status).toBe('warn')
  })

  it('fails when <loc> exceeds the 50,000 url-count cap', () => {
    const urls = Array.from({ length: 50_001 }, (_, i) => `<url><loc>https://example.com/p${i}</loc></url>`).join('')
    const r = validateSitemapXml(wrapUrlset(urls))
    expect(r.find((x) => x.rule === 'sitemap-url-count')?.status).toBe('fail')
  })

  it('fails when <loc> is not a valid absolute URL', () => {
    const r = validateSitemapXml(wrapUrlset('<url><loc>/relative/path</loc></url>'))
    expect(r.find((x) => x.rule === 'sitemap-loc-valid')?.status).toBe('fail')
  })

  it('warns when a <loc> exceeds 2048 characters', () => {
    const longPath = 'a'.repeat(2050)
    const r = validateSitemapXml(wrapUrlset(`<url><loc>https://example.com/${longPath}</loc></url>`))
    expect(r.find((x) => x.rule === 'sitemap-loc-length')?.status).toBe('warn')
  })

  it('warns when <loc> values span multiple hosts', () => {
    const r = validateSitemapXml(
      wrapUrlset(
        '<url><loc>https://example.com/a</loc></url>' +
        '<url><loc>https://other.com/b</loc></url>',
      ),
    )
    expect(r.find((x) => x.rule === 'sitemap-same-host')?.status).toBe('warn')
  })

  it('passes same-host when all URLs share one origin', () => {
    const r = validateSitemapXml(
      wrapUrlset('<url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url>'),
    )
    expect(r.find((x) => x.rule === 'sitemap-same-host')?.status).toBe('pass')
  })

  it('fails on invalid <changefreq> value', () => {
    const r = validateSitemapXml(
      wrapUrlset('<url><loc>https://example.com/</loc><changefreq>sometimes</changefreq></url>'),
    )
    expect(r.find((x) => x.rule === 'sitemap-changefreq-valid')?.status).toBe('fail')
  })

  it('accepts all seven valid <changefreq> values without flagging', () => {
    const body = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']
      .map((v, i) => `<url><loc>https://example.com/${i}</loc><changefreq>${v}</changefreq></url>`)
      .join('')
    const r = validateSitemapXml(wrapUrlset(body))
    expect(r.find((x) => x.rule === 'sitemap-changefreq-valid')).toBeUndefined()
  })

  it('fails on <priority> outside [0.0, 1.0]', () => {
    const r = validateSitemapXml(
      wrapUrlset('<url><loc>https://example.com/</loc><priority>1.5</priority></url>'),
    )
    expect(r.find((x) => x.rule === 'sitemap-priority-range')?.status).toBe('fail')
  })

  it('warns on <lastmod> not in W3C Datetime format', () => {
    const r = validateSitemapXml(
      wrapUrlset('<url><loc>https://example.com/</loc><lastmod>last week</lastmod></url>'),
    )
    expect(r.find((x) => x.rule === 'sitemap-lastmod-format')?.status).toBe('warn')
  })

  it('accepts both date and datetime forms of W3C Datetime in <lastmod>', () => {
    const r = validateSitemapXml(
      wrapUrlset(
        '<url><loc>https://example.com/a</loc><lastmod>2026-05-08</lastmod></url>' +
        '<url><loc>https://example.com/b</loc><lastmod>2026-05-08T12:34:56Z</lastmod></url>' +
        '<url><loc>https://example.com/c</loc><lastmod>2026-05-08T12:34:56+02:00</lastmod></url>',
      ),
    )
    expect(r.find((x) => x.rule === 'sitemap-lastmod-format')).toBeUndefined()
  })

  it('handles a <sitemapindex> root (skips urlset-only checks)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${NS}">\n<sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>\n</sitemapindex>`
    const r = validateSitemapXml(xml)
    expect(r.find((x) => x.rule === 'sitemap-root')?.status).toBe('pass')
    expect(r.find((x) => x.rule === 'sitemap-changefreq-valid')).toBeUndefined()
  })
})
