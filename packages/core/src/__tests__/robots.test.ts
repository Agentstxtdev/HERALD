import { describe, it, expect } from 'vitest'
import { generateRobotsTxt, FREE_AI_SCRAPERS, SEARCH_ENGINE_BOTS, PAID_AGENTIC_AGENTS } from '../robots.js'
import type { AgenticConfig } from '../types.js'

const baseConfig: AgenticConfig = {
  site: { name: 'Test Site', url: 'https://example.com' },
}

describe('generateRobotsTxt', () => {
  it('always includes the RFC 9309 header comment', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output).toContain('# robots.txt')
    expect(output).toContain('Standard: https://www.rfc-editor.org/rfc/rfc9309')
  })

  it('always includes the default wildcard allow rule', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output).toContain('User-agent: *')
    expect(output).toContain('Allow: /llms.txt')
    expect(output).toContain('Allow: /agents.txt')
    expect(output).toContain('Allow: /')
  })

  it('does not emit redundant # llms.txt or # agents.txt comment lines', () => {
    // The Agents-Txt: directive (when emitted) is the spec-defined way to
    // advertise agents.txt; llms.txt is always at /llms.txt and needs no
    // discovery hint. Commented-out duplicates were removed.
    const output = generateRobotsTxt(baseConfig)
    expect(output).not.toContain('# llms.txt:')
    expect(output).not.toContain('# agents.txt:')
  })

  it('always includes Content-Signal directive', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output).toContain('Content-Signal:')
  })

  it('sets search=yes when allowSearchEngines is true (default)', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output).toContain('search=yes')
  })

  it('sets search=no when allowSearchEngines is false', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { allowSearchEngines: false },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('search=no')
  })

  it('sets ai-train=no and ai-input=no when blockFreeAiScrapers is true (default)', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output).toContain('ai-train=no')
    expect(output).toContain('ai-input=no')
  })

  it('sets ai-train=yes and ai-input=yes when blockFreeAiScrapers is false', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { blockFreeAiScrapers: false },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('ai-train=yes')
    expect(output).toContain('ai-input=yes')
  })

  it('never emits an Agents-Txt: directive (per agents.txt spec §4.3)', () => {
    // The spec MUST NOT-emits a separate Agents-Txt: directive: agents.txt is
    // fixed at <origin>/agents.txt, and the `Allow: /agents.txt` line in the
    // wildcard block already exposes the file. Verify across capability shapes.
    const configs: AgenticConfig[] = [
      baseConfig,
      { site: baseConfig.site, payments: { protocols: ['x402'] } },
      { site: baseConfig.site, authorization: { enabled: true } },
      { site: baseConfig.site, mcp: { endpoints: 'https://example.com/mcp' } },
      { site: baseConfig.site, skills: { urls: 'https://example.com/skills/main/SKILL.md' } },
    ]
    for (const config of configs) {
      const output = generateRobotsTxt(config)
      expect(output).not.toContain('Agents-Txt:')
      // Allow rule is the actual discovery surface.
      expect(output).toContain('Allow: /agents.txt')
    }
  })

  it('strips trailing slash from site.url in discovery directives', () => {
    const config: AgenticConfig = {
      site: { name: 'Test', url: 'https://example.com/' },
      content: { driver: { type: 'static', pages: [{ title: 'Home', url: 'https://example.com/' }] } },
      payments: { enabled: true },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Sitemap: https://example.com/sitemap.xml')
    expect(output).not.toContain('https://example.com//')
  })

  it('blocks all FREE_AI_SCRAPERS by default', () => {
    const output = generateRobotsTxt(baseConfig)
    for (const bot of FREE_AI_SCRAPERS) {
      expect(output).toContain(`User-agent: ${bot}`)
    }
    expect(output).toContain('Disallow: /')
  })

  it('does not include free AI scraper block when blockFreeAiScrapers is false', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { blockFreeAiScrapers: false },
    }
    const output = generateRobotsTxt(config)
    expect(output).not.toContain('GPTBot')
    expect(output).not.toContain('ClaudeBot')
  })

  it('allows search engine bots by default', () => {
    const output = generateRobotsTxt(baseConfig)
    for (const bot of SEARCH_ENGINE_BOTS) {
      expect(output).toContain(`User-agent: ${bot}`)
    }
    const searchSection = output.indexOf('# Search engine crawlers')
    expect(searchSection).toBeGreaterThan(-1)
  })

  it('omits search engine section when allowSearchEngines is false', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { allowSearchEngines: false },
    }
    const output = generateRobotsTxt(config)
    expect(output).not.toContain('Googlebot')
    expect(output).not.toContain('Bingbot')
  })

  it('PAID_AGENTIC_AGENTS is empty by default — no canonical paid-crawler UA exists yet', () => {
    expect(PAID_AGENTIC_AGENTS).toEqual([])
  })

  it('does not emit a paid-agents section when the allowlist is empty', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output).not.toContain('# Paid agentic agents')
  })

  it('appends additionalDirectives verbatim, one per line, after Content-Signal', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: {
        additionalDirectives: [
          'Schemamap: https://example.com/schemamap.xml',
          'Host: example.com',
        ],
      },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Schemamap: https://example.com/schemamap.xml')
    expect(output).toContain('Host: example.com')
    // Order: Content-Signal first, then the appended directives in declaration order.
    const csIdx = output.indexOf('Content-Signal:')
    const smIdx = output.indexOf('Schemamap:')
    const hsIdx = output.indexOf('Host:')
    expect(csIdx).toBeGreaterThan(-1)
    expect(smIdx).toBeGreaterThan(csIdx)
    expect(hsIdx).toBeGreaterThan(smIdx)
  })

  it('trims and skips empty lines inside additionalDirectives', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { additionalDirectives: ['  Schemamap: https://example.com/sm.xml  ', '', '   '] },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Schemamap: https://example.com/sm.xml')
    expect(output).not.toContain('Schemamap: https://example.com/sm.xml  ')
  })

  it('emits any additionalAllowList entries under the paid-agents section', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { additionalAllowList: ['MyCrawlerBot'] },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('# Paid agentic agents')
    expect(output).toContain('User-agent: MyCrawlerBot')
  })

  it('omits paid agent section when allowPaidAgents is false', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { allowPaidAgents: false, additionalAllowList: ['MyCrawlerBot'] },
    }
    const output = generateRobotsTxt(config)
    expect(output).not.toContain('# Paid agentic agents')
  })

  it('includes additionalBlockList bots in the block section', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { additionalBlockList: ['CustomScraperBot', 'AnotherBot'] },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('User-agent: CustomScraperBot')
    expect(output).toContain('User-agent: AnotherBot')
  })

  it('includes additionalAllowList bots in the allow section', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { additionalAllowList: ['MyTrustedBot'] },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('User-agent: MyTrustedBot')
  })

  it('includes additionalAllowList as custom allowed section when allowPaidAgents is false', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { allowPaidAgents: false, additionalAllowList: ['SpecialBot'] },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('User-agent: SpecialBot')
    expect(output).toContain('# Custom allowed agents')
  })

  it('includes custom rules with allow, disallow, and crawl-delay', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: {
        customRules: [
          {
            userAgent: 'MyBot',
            allow: ['/public'],
            disallow: ['/private'],
            crawlDelay: 5,
          },
        ],
      },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('User-agent: MyBot')
    expect(output).toContain('Allow: /public')
    expect(output).toContain('Disallow: /private')
    expect(output).toContain('Crawl-delay: 5')
  })

  it('does not include Crawl-delay when not specified in custom rule', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { customRules: [{ userAgent: 'MyBot' }] },
    }
    const output = generateRobotsTxt(config)
    expect(output).not.toContain('Crawl-delay')
  })

  it('includes absolute sitemap URL when content driver is sitemap type', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      content: { driver: { type: 'sitemap', sitemapUrl: 'https://example.com/sitemap.xml' } },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it('prepends baseUrl to relative sitemap URL', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      content: { driver: { type: 'sitemap', sitemapUrl: '/sitemap.xml' } },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it('emits Sitemap: pointing at /sitemap.xml for static driver', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      content: {
        driver: { type: 'static', pages: [] },
      },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain(`Sitemap: ${baseConfig.site.url.replace(/\/$/, '')}/sitemap.xml`)
  })

  it('emits Sitemap: pointing at /sitemap.xml for manual driver', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      content: {
        driver: { type: 'manual', sections: [] },
      },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain(`Sitemap: ${baseConfig.site.url.replace(/\/$/, '')}/sitemap.xml`)
  })

  it('does not include Sitemap directive for firecrawl driver', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      content: {
        driver: { type: 'firecrawl', siteUrl: baseConfig.site.url, apiKey: 'test' },
      },
    }
    const output = generateRobotsTxt(config)
    expect(output).not.toContain('Sitemap:')
  })

  it('preserves existingContent at the bottom', () => {
    const existing = 'User-agent: LegacyBot\nDisallow: /old'
    const output = generateRobotsTxt(baseConfig, existing)
    const preservedIdx = output.indexOf('# ── Existing rules (preserved)')
    const existingIdx = output.indexOf('User-agent: LegacyBot')
    expect(preservedIdx).toBeGreaterThan(-1)
    expect(existingIdx).toBeGreaterThan(preservedIdx)
  })

  it('does not include existing rules section when existingContent is empty', () => {
    const output = generateRobotsTxt(baseConfig, '')
    expect(output).not.toContain('Existing rules')
  })

  it('ends with a newline', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output.endsWith('\n')).toBe(true)
  })
})
