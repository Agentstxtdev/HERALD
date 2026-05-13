import type { AgenticConfig, ContentDriver, ContentSection, LlmsDriver } from './types.js'
import { parseSitemap, crawlWithFirecrawl, scrapeMarkdownWithFirecrawl, groupPagesByPath } from './sitemap.js'

// ─────────────────────────────────────────────────────────────────────────────
// llms.txt generator — follows the llmstxt.org specification exactly
// Spec: https://llmstxt.org/
// ─────────────────────────────────────────────────────────────────────────────

function renderSection(section: ContentSection): string[] {
  const lines: string[] = []
  lines.push(`## ${section.name}`)
  for (const page of section.pages) {
    const desc = page.description ? `: ${page.description}` : ''
    lines.push(`- [${page.title}](${page.url})${desc}`)
  }
  return lines
}

async function resolveContent(config: AgenticConfig, driver?: ContentDriver): Promise<ContentSection[]> {
  if (driver) return driver.resolve()

  const d = config.content?.driver
  if (!d) return []

  switch (d.type) {
    case 'sitemap': {
      const pages = await parseSitemap(d.sitemapUrl)
      return groupPagesByPath(pages)
    }

    case 'firecrawl': {
      const pages = await crawlWithFirecrawl(d)
      return groupPagesByPath(pages)
    }

    case 'static': {
      const explicit = d.sections ?? []
      if (explicit.length > 0) {
        return d.pages.length > 0
          ? [...explicit, { name: 'Pages', pages: d.pages }]
          : explicit
      }
      return [{ name: 'Pages', pages: d.pages }]
    }

    case 'manual': {
      return d.sections
    }
  }
}

/**
 * Generate a spec-compliant llms.txt string.
 *
 * The format is:
 *   # Site Name              ← required H1
 *   > description            ← optional blockquote
 *   prose                    ← optional prose (no headings)
 *   ## Section               ← H2 sections with link lists
 *   ## Optional              ← optional-content section (exact name)
 */
export async function generateLlmsTxt(config: AgenticConfig, driver?: ContentDriver): Promise<string> {
  const { site } = config
  const lines: string[] = []
  const blank = () => lines.push('')

  // ── H1 title (required) ────────────────────────────────────────────────────
  lines.push(`# ${site.name}`)
  blank()

  // ── Blockquote summary (optional but strongly recommended) ─────────────────
  if (site.description) {
    lines.push(`> ${site.description}`)
    blank()
  }

  // ── Resolve page sections ─────────────────────────────────────────────────
  const allSections = await resolveContent(config, driver)
  const requiredSections = allSections.filter((s) => !s.optional)
  const optionalSections = allSections.filter((s) => s.optional)

  for (const section of requiredSections) {
    lines.push(...renderSection(section))
    blank()
  }

  // ── Optional section (spec-mandated exact name) ────────────────────────────
  if (optionalSections.length > 0) {
    lines.push('## Optional')
    for (const section of optionalSections) {
      for (const page of section.pages) {
        const desc = page.description ? `: ${page.description}` : ''
        lines.push(`- [${page.title}](${page.url})${desc}`)
      }
    }
    blank()
  }

  return lines.join('\n').trimEnd() + '\n'
}

/**
 * Generate /llms-full.txt — long-form companion that inlines actual page content
 * under each `### [title](url)` heading.
 *
 * Source: `config.content.fullTxt.driver` (typically pointed at a docs subdomain).
 * Falls back to `config.content.driver` when `fullTxt.driver` is omitted but a
 * `ContentDriver` is passed explicitly. Returns `generateLlmsTxt(config)` when
 * neither source is available — same behaviour as the regular llms.txt.
 *
 * Markdown is scraped via Firecrawl `/v2/scrape` when the source driver is
 * `firecrawl`. Other driver types (sitemap, static, manual) produce only the
 * link + description per page; without a scraper we have no way to fetch the
 * actual body content while preserving core's zero-dependency guarantee.
 */
export async function generateLlmsFullTxt(config: AgenticConfig, driver?: ContentDriver): Promise<string> {
  // Pick the source: explicit driver arg → fullTxt.driver → main driver → fallback to llms.txt
  const fullSourceConfig: LlmsDriver | undefined =
    config.content?.fullTxt?.driver ?? config.content?.driver

  if (!driver && !fullSourceConfig) return generateLlmsTxt(config)

  const { site } = config
  const lines: string[] = []
  const blank = () => lines.push('')

  lines.push(`# ${site.name}`)
  blank()
  if (site.description) {
    lines.push(`> ${site.description}`)
    blank()
  }

  // Resolve sections — explicit driver wins; otherwise build a temporary config
  // that points the main resolver at the fullTxt source, leaving config untouched.
  const sections: ContentSection[] = driver
    ? await driver.resolve()
    : await resolveContent(
        { ...config, content: { ...config.content, driver: fullSourceConfig as LlmsDriver } },
      )

  // Scraper picks: when the source is firecrawl, use its API key for /v2/scrape
  const firecrawlKey =
    fullSourceConfig?.type === 'firecrawl' ? fullSourceConfig.apiKey : undefined

  // Concurrency cap so we don't slam the Firecrawl rate limit
  const SCRAPE_CONCURRENCY = 5

  for (const section of sections) {
    lines.push(`## ${section.name}`)
    blank()

    if (firecrawlKey) {
      // Scrape pages in this section, batched
      const batches: typeof section.pages[] = []
      for (let i = 0; i < section.pages.length; i += SCRAPE_CONCURRENCY) {
        batches.push(section.pages.slice(i, i + SCRAPE_CONCURRENCY))
      }
      for (const batch of batches) {
        const scrapes = await Promise.allSettled(
          batch.map((p) => scrapeMarkdownWithFirecrawl(p.url, firecrawlKey)),
        )
        batch.forEach((page, idx) => {
          lines.push(`### [${page.title}](${page.url})`)
          if (page.description) {
            lines.push(`> ${page.description}`)
            blank()
          }
          const r = scrapes[idx]
          const md = r?.status === 'fulfilled' ? r.value : undefined
          if (md && md.trim()) {
            lines.push(md.trim())
          } else if (!page.description) {
            lines.push('_(content unavailable)_')
          }
          blank()
        })
      }
    } else {
      // No scraper available — emit link + description only
      for (const page of section.pages) {
        lines.push(`### [${page.title}](${page.url})`)
        if (page.description) lines.push(`${page.description}`)
        blank()
      }
    }
  }

  return lines.join('\n').trimEnd() + '\n'
}
