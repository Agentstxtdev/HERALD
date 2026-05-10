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

  it('always includes agentic discovery comments', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output).toContain('# llms.txt: https://example.com/llms.txt')
    expect(output).toContain('# agents.txt: https://example.com/agents.txt')
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

  it('includes Agents-Txt directive when payments are enabled', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { enabled: true, protocols: ['x402'] },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Agents-Txt: https://example.com/agents.txt')
  })

  it('does not include Agents-Txt directive when payments are disabled', () => {
    const output = generateRobotsTxt(baseConfig)
    expect(output).not.toContain('Agents-Txt:')
  })

  it('includes Agents-Txt directive when authorization is enabled (without payments)', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      authorization: { enabled: true },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Agents-Txt: https://example.com/agents.txt')
  })

  it('does not include Agents-Txt directive when authorization is disabled and payments are disabled', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      authorization: { enabled: false },
    }
    const output = generateRobotsTxt(config)
    expect(output).not.toContain('Agents-Txt:')
  })

  it('includes Agents-Txt directive when mcp is configured (without payments or authorization)', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: 'https://example.com/mcp' },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Agents-Txt: https://example.com/agents.txt')
  })

  it('includes Agents-Txt directive when skills is configured (without payments, authorization, or mcp)', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: { urls: 'https://example.com/.well-known/skills/main.md' },
    }
    const output = generateRobotsTxt(config)
    expect(output).toContain('Agents-Txt: https://example.com/agents.txt')
  })

  it('strips trailing slash from site.url in discovery comments', () => {
    const config: AgenticConfig = { site: { name: 'Test', url: 'https://example.com/' } }
    const output = generateRobotsTxt(config)
    expect(output).toContain('# llms.txt: https://example.com/llms.txt')
    expect(output).not.toContain('https://example.com//llms.txt')
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

  it('allows paid agentic agents by default', () => {
    const output = generateRobotsTxt(baseConfig)
    for (const bot of PAID_AGENTIC_AGENTS) {
      expect(output).toContain(`User-agent: ${bot}`)
    }
  })

  it('omits paid agent section when allowPaidAgents is false', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      crawlers: { allowPaidAgents: false },
    }
    const output = generateRobotsTxt(config)
    expect(output).not.toContain('AgentstxtBot')
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
