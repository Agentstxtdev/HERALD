import { describe, it, expect } from 'vitest'
import {
  groupPagesByPath,
  staticDriver,
  manualDriver,
  sitemapDriver,
  firecrawlDriver,
  generateSitemapXml,
} from '../sitemap.js'
import type { PageEntry, ContentSection } from '../types.js'

describe('generateSitemapXml', () => {
  it('emits a sitemaps.org 0.9 urlset', () => {
    const xml = generateSitemapXml([
      { title: 'Home', url: 'https://example.com/' },
      { title: 'About', url: 'https://example.com/about' },
    ])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('<loc>https://example.com/about</loc>')
    expect(xml).toMatch(/<\/urlset>\n$/)
  })

  it('deduplicates pages by url', () => {
    const xml = generateSitemapXml([
      { title: 'Home', url: 'https://example.com/' },
      { title: 'Home dup', url: 'https://example.com/' },
    ])
    expect(xml.match(/<loc>https:\/\/example\.com\/<\/loc>/g)).toHaveLength(1)
  })

  it('escapes XML-significant characters in URLs', () => {
    const xml = generateSitemapXml([
      { title: 'Search', url: 'https://example.com/?q=a&b=<x>' },
    ])
    expect(xml).toContain('<loc>https://example.com/?q=a&amp;b=&lt;x&gt;</loc>')
    expect(xml).not.toContain('?q=a&b=<x>')
  })

  it('produces a valid empty urlset for no pages', () => {
    const xml = generateSitemapXml([])
    expect(xml).toContain('<urlset')
    expect(xml).toContain('</urlset>')
    expect(xml).not.toContain('<url>')
  })
})

describe('groupPagesByPath', () => {
  it('groups pages by first path segment', () => {
    const pages: PageEntry[] = [
      { title: 'Blog Post 1', url: 'https://example.com/blog/post-1' },
      { title: 'Blog Post 2', url: 'https://example.com/blog/post-2' },
      { title: 'Docs Intro', url: 'https://example.com/docs/intro' },
    ]
    const sections = groupPagesByPath(pages)
    const names = sections.map((s) => s.name)
    expect(names).toContain('Blog')
    expect(names).toContain('Docs')
  })

  it('capitalises the section name from the path segment', () => {
    const pages: PageEntry[] = [{ title: 'API Page', url: 'https://example.com/api/v1' }]
    const sections = groupPagesByPath(pages)
    expect(sections[0]?.name).toBe('Api')
  })

  it('assigns root-level pages to the Home section', () => {
    const pages: PageEntry[] = [{ title: 'Home', url: 'https://example.com/' }]
    const sections = groupPagesByPath(pages)
    expect(sections[0]?.name).toBe('Home')
  })

  it('assigns pages with invalid URLs to the Pages section', () => {
    const pages: PageEntry[] = [{ title: 'Bad', url: 'not-a-url' }]
    const sections = groupPagesByPath(pages)
    expect(sections[0]?.name).toBe('Pages')
  })

  it('returns an empty array for empty input', () => {
    expect(groupPagesByPath([])).toEqual([])
  })

  it('preserves all pages in their respective sections', () => {
    const pages: PageEntry[] = [
      { title: 'A', url: 'https://example.com/docs/a' },
      { title: 'B', url: 'https://example.com/docs/b' },
    ]
    const sections = groupPagesByPath(pages)
    const docsSection = sections.find((s) => s.name === 'Docs')
    expect(docsSection?.pages).toHaveLength(2)
  })
})

describe('staticDriver', () => {
  it('resolves pages into a single Pages section when no explicit sections', async () => {
    const pages: PageEntry[] = [
      { title: 'Home', url: 'https://example.com/' },
      { title: 'About', url: 'https://example.com/about' },
    ]
    const driver = staticDriver(pages)
    const sections = await driver.resolve()
    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe('Pages')
    expect(sections[0]?.pages).toEqual(pages)
  })

  it('returns only explicit sections when pages array is empty', async () => {
    const sections: ContentSection[] = [
      { name: 'Guides', pages: [{ title: 'G', url: 'https://example.com/g' }] },
    ]
    const driver = staticDriver([], sections)
    const result = await driver.resolve()
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Guides')
  })

  it('appends Pages section after explicit sections when both provided', async () => {
    const sections: ContentSection[] = [
      { name: 'Guides', pages: [{ title: 'G', url: 'https://example.com/g' }] },
    ]
    const pages: PageEntry[] = [{ title: 'Home', url: 'https://example.com/' }]
    const driver = staticDriver(pages, sections)
    const result = await driver.resolve()
    expect(result).toHaveLength(2)
    expect(result[0]?.name).toBe('Guides')
    expect(result[1]?.name).toBe('Pages')
  })
})

describe('manualDriver', () => {
  it('returns provided sections as-is', async () => {
    const sections: ContentSection[] = [
      { name: 'Docs', pages: [{ title: 'Intro', url: 'https://example.com/docs' }] },
    ]
    const driver = manualDriver(sections)
    const result = await driver.resolve()
    expect(result).toEqual(sections)
  })

  it('returns empty array for empty sections', async () => {
    const driver = manualDriver([])
    const result = await driver.resolve()
    expect(result).toEqual([])
  })
})

describe('sitemapDriver', () => {
  it('returns a ContentDriver with a resolve function', () => {
    const driver = sitemapDriver('https://example.com/sitemap.xml')
    expect(typeof driver.resolve).toBe('function')
  })
})

describe('firecrawlDriver', () => {
  it('returns a ContentDriver with a resolve function', () => {
    const driver = firecrawlDriver({ siteUrl: 'https://example.com', apiKey: 'fc-test-key' })
    expect(typeof driver.resolve).toBe('function')
  })

  it('accepts the v2 map options (search, sitemap, includeSubdomains, ignoreQueryParameters, limit)', () => {
    const driver = firecrawlDriver({
      siteUrl: 'https://example.com',
      apiKey: 'fc-test-key',
      limit: 1000,
      search: 'pricing',
      sitemap: 'only',
      includeSubdomains: false,
      ignoreQueryParameters: false,
    })
    expect(typeof driver.resolve).toBe('function')
  })
})
