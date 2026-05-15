import type { PageEntry, ContentSection, ContentDriver } from './types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Sitemap parser — fetches and parses a standard sitemap.xml
// Handles <urlset> (standard) and <sitemapindex> (index of sitemaps) formats
// ─────────────────────────────────────────────────────────────────────────────

function unwrapCdata(value: string): string {
  const m = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  return m ? (m[1] ?? value) : value
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  const raw = match?.[1]?.trim()
  return raw !== undefined ? decodeXmlEntities(unwrapCdata(raw)) : undefined
}

function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const results: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    if (match[1] !== undefined) results.push(match[1].trim())
  }
  return results
}

function urlToTitle(url: string): string {
  try {
    const path = new URL(url).pathname
    const segment = path.split('/').filter(Boolean).pop() ?? ''
    if (!segment) return 'Home'
    return segment
      .replace(/[-_]/g, ' ')
      .replace(/\.[^.]+$/, '')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  } catch {
    return 'Page'
  }
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'AgentstxtBot/1.0 (+https://github.com/agents-txt/herald)' },
  })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.text()
}

const SITEMAP_PAGE_LIMIT = 5_000

async function parseSitemapXml(
  url: string,
  depth = 0,
  acc: PageEntry[] = [],
): Promise<PageEntry[]> {
  if (depth > 2 || acc.length >= SITEMAP_PAGE_LIMIT) return acc

  const xml = await fetchXml(url)

  // Sitemap index — recurse into each child sitemap
  const sitemapLocs = extractAllTags(xml, 'sitemap')
  if (sitemapLocs.length > 0) {
    for (const sitemapBlock of sitemapLocs) {
      if (acc.length >= SITEMAP_PAGE_LIMIT) break
      const loc = extractTag(sitemapBlock, 'loc')
      if (loc) await parseSitemapXml(loc, depth + 1, acc)
    }
    return acc
  }

  // Standard urlset
  const urlBlocks = extractAllTags(xml, 'url')
  for (const block of urlBlocks) {
    if (acc.length >= SITEMAP_PAGE_LIMIT) break
    const loc = extractTag(block, 'loc')
    if (!loc) continue

    const title =
      extractTag(block, 'title') ??
      extractTag(block, 'news:title') ??
      urlToTitle(loc)

    const description =
      extractTag(block, 'description') ??
      extractTag(block, 'news:publication_date')

    acc.push({ title, url: loc, ...(description !== undefined && { description }) })
  }

  return acc
}

export async function parseSitemap(sitemapUrl: string): Promise<PageEntry[]> {
  return parseSitemapXml(sitemapUrl)
}

// ─────────────────────────────────────────────────────────────────────────────
// Firecrawl driver — discovers pages via the Firecrawl v2 /map endpoint.
// Spec: https://docs.firecrawl.dev/api-reference/endpoint/map
//
// One API call. /v2/map returns { url, title?, description? } per link, so no
// per-URL scraping is needed to populate llms.txt entries.
// Free tier requires an account at firecrawl.dev (no credit card).
// ─────────────────────────────────────────────────────────────────────────────

interface FirecrawlMapLink {
  url: string
  title?: string
  description?: string
}

interface FirecrawlMapResponse {
  success: boolean
  links?: FirecrawlMapLink[]
  error?: string
}

export interface FirecrawlMapOptions {
  /** Base URL to crawl */
  siteUrl: string
  /** Firecrawl API key */
  apiKey: string
  /** Max URLs returned. v2 default: 5000, max: 100000. We default to 5000. */
  limit?: number
  /** Order results by relevance for this search query */
  search?: string
  /** Sitemap handling: 'include' (default) | 'skip' | 'only' */
  sitemap?: 'include' | 'skip' | 'only'
  /** Include subdomains. Default: true */
  includeSubdomains?: boolean
  /** Drop URLs carrying query parameters. Default: true */
  ignoreQueryParameters?: boolean
}

export async function crawlWithFirecrawl(opts: FirecrawlMapOptions): Promise<PageEntry[]> {
  const body: Record<string, unknown> = { url: opts.siteUrl }
  if (opts.limit !== undefined) body.limit = opts.limit
  if (opts.search !== undefined) body.search = opts.search
  if (opts.sitemap !== undefined) body.sitemap = opts.sitemap
  if (opts.includeSubdomains !== undefined) body.includeSubdomains = opts.includeSubdomains
  if (opts.ignoreQueryParameters !== undefined) body.ignoreQueryParameters = opts.ignoreQueryParameters

  const res = await fetch('https://api.firecrawl.dev/v2/map', {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Firecrawl /v2/map failed: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as FirecrawlMapResponse
  if (!data.success || !data.links) {
    throw new Error(`Firecrawl error: ${data.error ?? 'unknown'}`)
  }

  return data.links.map((link) => ({
    title: link.title ?? urlToTitle(link.url),
    url: link.url,
    ...(link.description !== undefined && { description: link.description }),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Firecrawl /v2/scrape — fetch a single page as markdown
// Used by generateLlmsFullTxt to inline actual page content under each ### heading.
// Spec: https://docs.firecrawl.dev/api-reference/endpoint/scrape
// ─────────────────────────────────────────────────────────────────────────────

interface FirecrawlScrapeResponse {
  success: boolean
  data?: { markdown?: string }
  error?: string
}

export async function scrapeMarkdownWithFirecrawl(
  url: string,
  apiKey: string,
): Promise<string | undefined> {
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
  })
  if (!res.ok) return undefined
  const data = (await res.json()) as FirecrawlScrapeResponse
  if (!data.success) return undefined
  return data.data?.markdown
}

// ─────────────────────────────────────────────────────────────────────────────
// Group pages into sections by path prefix for cleaner llms.txt output
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ContentDriver factories — satisfy the ContentDriver interface at the seam.
// Pass one of these to generateLlmsTxt() to replace the default config-driven
// resolution with a test stub or a custom implementation.
// ─────────────────────────────────────────────────────────────────────────────

export function sitemapDriver(sitemapUrl: string): ContentDriver {
  return { resolve: async () => groupPagesByPath(await parseSitemap(sitemapUrl)) }
}

export function firecrawlDriver(opts: FirecrawlMapOptions): ContentDriver {
  return { resolve: async () => groupPagesByPath(await crawlWithFirecrawl(opts)) }
}

export function staticDriver(pages: PageEntry[], sections?: ContentSection[]): ContentDriver {
  return {
    resolve: async () => {
      const explicit = sections ?? []
      if (explicit.length > 0) {
        return pages.length > 0
          ? [...explicit, { name: 'Pages', pages }]
          : explicit
      }
      return [{ name: 'Pages', pages }]
    },
  }
}

export function manualDriver(sections: ContentSection[]): ContentDriver {
  return { resolve: async () => sections }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sitemap generator — sitemaps.org 0.9 schema
//
// Emits a minimal <urlset> from a list of pages. Used by the CLI when the user
// has authoritative URLs (content.driver: 'static' | 'manual') or explicitly
// opts in with --sitemap. Skipped by default for drivers where HERALD is not
// the source of truth (existing sitemap.xml, Firecrawl-curated subset).
// ─────────────────────────────────────────────────────────────────────────────

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function generateSitemapXml(pages: PageEntry[]): string {
  const seen = new Set<string>()
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ]
  for (const page of pages) {
    if (seen.has(page.url)) continue
    seen.add(page.url)
    lines.push('  <url>')
    lines.push(`    <loc>${escapeXml(page.url)}</loc>`)
    lines.push('  </url>')
  }
  lines.push('</urlset>')
  return lines.join('\n') + '\n'
}

export function groupPagesByPath(pages: PageEntry[]): ContentSection[] {
  const groups: Map<string, PageEntry[]> = new Map()

  for (const page of pages) {
    try {
      const pathname = new URL(page.url).pathname
      const prefix = pathname.split('/').filter(Boolean)[0] ?? ''
      const section = prefix
        ? prefix.charAt(0).toUpperCase() + prefix.slice(1)
        : 'Home'
      const existing = groups.get(section) ?? []
      existing.push(page)
      groups.set(section, existing)
    } catch {
      const existing = groups.get('Pages') ?? []
      existing.push(page)
      groups.set('Pages', existing)
    }
  }

  return Array.from(groups.entries()).map(([name, pages]) => ({ name, pages }))
}
