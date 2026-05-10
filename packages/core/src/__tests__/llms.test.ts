import { describe, it, expect } from 'vitest'
import { generateLlmsTxt, generateLlmsFullTxt } from '../llms.js'
import { staticDriver, manualDriver } from '../sitemap.js'
import type { AgenticConfig, ContentSection } from '../types.js'

const baseConfig: AgenticConfig = {
  site: { name: 'Test Site', url: 'https://example.com' },
}

describe('generateLlmsTxt', () => {
  it('starts with H1 site name', async () => {
    const output = await generateLlmsTxt(baseConfig)
    expect(output.startsWith('# Test Site')).toBe(true)
  })

  it('includes description as blockquote when provided', async () => {
    const config: AgenticConfig = {
      site: { name: 'Test', url: 'https://example.com', description: 'A great site' },
    }
    const output = await generateLlmsTxt(config)
    expect(output).toContain('> A great site')
  })

  it('omits blockquote when description is not provided', async () => {
    const output = await generateLlmsTxt(baseConfig)
    expect(output).not.toContain('> ')
  })

  it('does not inject payment information even when payments.x402 is configured', async () => {
    // llms.txt is Layer 3 (content curation). Payment declarations belong in
    // Layer 4 (agents.txt / agents.json) and 402 challenges, not here.
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        enabled: true,
        x402: {
          treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
          pricing: { amount: '0.002', token: 'USDC' },
        },
      },
    }
    const output = await generateLlmsTxt(config)
    expect(output).not.toContain('x402 payment protocol')
    expect(output).not.toContain('Treasury:')
    expect(output).not.toContain('Discovery:')
    expect(output).not.toContain('USDC')
  })

  it('renders pages as H2 section with links using staticDriver', async () => {
    const pages = [
      { title: 'Home', url: 'https://example.com/', description: 'Homepage' },
      { title: 'About', url: 'https://example.com/about' },
    ]
    const output = await generateLlmsTxt(baseConfig, staticDriver(pages))
    expect(output).toContain('## Pages')
    expect(output).toContain('- [Home](https://example.com/): Homepage')
    expect(output).toContain('- [About](https://example.com/about)')
  })

  it('omits description from link when not present', async () => {
    const pages = [{ title: 'About', url: 'https://example.com/about' }]
    const output = await generateLlmsTxt(baseConfig, staticDriver(pages))
    expect(output).toContain('- [About](https://example.com/about)')
    expect(output).not.toContain('- [About](https://example.com/about):')
  })

  it('renders manual sections in order', async () => {
    const sections: ContentSection[] = [
      { name: 'Docs', pages: [{ title: 'Guide', url: 'https://example.com/guide' }] },
      { name: 'API', pages: [{ title: 'Reference', url: 'https://example.com/api' }] },
    ]
    const output = await generateLlmsTxt(baseConfig, manualDriver(sections))
    const docsIdx = output.indexOf('## Docs')
    const apiIdx = output.indexOf('## API')
    expect(docsIdx).toBeGreaterThan(-1)
    expect(apiIdx).toBeGreaterThan(docsIdx)
  })

  it('places optional sections under ## Optional heading', async () => {
    const sections: ContentSection[] = [
      { name: 'Required', pages: [{ title: 'A', url: 'https://example.com/a' }] },
      { name: 'Extra', pages: [{ title: 'B', url: 'https://example.com/b' }], optional: true },
    ]
    const output = await generateLlmsTxt(baseConfig, manualDriver(sections))
    expect(output).toContain('## Optional')
    expect(output).not.toContain('## Extra')
    expect(output).toContain('- [B](https://example.com/b)')
  })

  it('merges multiple optional sections under a single ## Optional heading', async () => {
    const sections: ContentSection[] = [
      { name: 'Opt1', pages: [{ title: 'X', url: 'https://example.com/x' }], optional: true },
      { name: 'Opt2', pages: [{ title: 'Y', url: 'https://example.com/y' }], optional: true },
    ]
    const output = await generateLlmsTxt(baseConfig, manualDriver(sections))
    const count = (output.match(/## Optional/g) ?? []).length
    expect(count).toBe(1)
    expect(output).toContain('- [X](https://example.com/x)')
    expect(output).toContain('- [Y](https://example.com/y)')
  })

  it('produces only header when no content configured and no driver passed', async () => {
    const output = await generateLlmsTxt(baseConfig)
    expect(output.trim()).toBe('# Test Site')
  })

  it('ends with a newline', async () => {
    const output = await generateLlmsTxt(baseConfig)
    expect(output.endsWith('\n')).toBe(true)
  })

  it('uses static driver sections + pages when both provided', async () => {
    const sections: ContentSection[] = [
      { name: 'Guides', pages: [{ title: 'G1', url: 'https://example.com/g1' }] },
    ]
    const pages = [{ title: 'Standalone', url: 'https://example.com/standalone' }]
    const output = await generateLlmsTxt(baseConfig, staticDriver(pages, sections))
    expect(output).toContain('## Guides')
    expect(output).toContain('## Pages')
    expect(output).toContain('Standalone')
  })
})

describe('generateLlmsFullTxt', () => {
  it('falls back to generateLlmsTxt when neither driver arg nor any content driver is configured', async () => {
    const output = await generateLlmsFullTxt(baseConfig)
    expect(output.startsWith('# Test Site')).toBe(true)
  })

  it('uses content.driver as fullTxt source when fullTxt block is omitted', async () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      content: { driver: { type: 'static', pages: [{ title: 'Home', url: 'https://example.com/' }] } },
    }
    const output = await generateLlmsFullTxt(config)
    expect(output).toContain('### [Home](https://example.com/)')
  })

  it('uses content.fullTxt.driver when present (typically docs subdomain)', async () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      content: {
        driver: { type: 'sitemap', sitemapUrl: 'https://example.com/sitemap.xml' },
        fullTxt: {
          driver: {
            type: 'static',
            pages: [{ title: 'API Reference', url: 'https://docs.example.com/api', description: 'How to call the API' }],
          },
        },
      },
    }
    const output = await generateLlmsFullTxt(config)
    expect(output).toContain('### [API Reference](https://docs.example.com/api)')
    expect(output).toContain('How to call the API')
  })

  it('renders pages with H3 headings when an explicit driver is provided', async () => {
    const pages = [{ title: 'Home', url: 'https://example.com/', description: 'The homepage' }]
    const output = await generateLlmsFullTxt(baseConfig, staticDriver(pages))
    expect(output).toContain('### [Home](https://example.com/)')
    expect(output).toContain('The homepage')
  })

  it('includes site name and description in full txt', async () => {
    const config: AgenticConfig = {
      site: { name: 'My Site', url: 'https://example.com', description: 'Nice site' },
    }
    const output = await generateLlmsFullTxt(config, staticDriver([]))
    expect(output).toContain('# My Site')
    expect(output).toContain('> Nice site')
  })

  it('emits link-list (no scraping) when source driver is not firecrawl', async () => {
    // No firecrawl key available → can't fetch markdown → just inline link + description
    const pages = [{ title: 'Quickstart', url: 'https://docs.example.com/quickstart', description: 'Five-minute tutorial' }]
    const output = await generateLlmsFullTxt(baseConfig, staticDriver(pages))
    expect(output).toContain('### [Quickstart](https://docs.example.com/quickstart)')
    expect(output).toContain('Five-minute tutorial')
    // No scraped body content should appear
    expect(output).not.toContain('_(content unavailable)_')
  })
})
