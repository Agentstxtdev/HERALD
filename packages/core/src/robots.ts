import type { AgenticConfig, CrawlerRule } from './types.js'

/**
 * Stable string emitted at the top of every herald-generated robots.txt.
 * Consumers (e.g. the CLI's `generate` command) use it as the marker to detect
 * "we generated this file before" and avoid the merge-then-duplicate trap on
 * regen. Do NOT change without updating every consumer that imports it.
 *
 * This MUST remain on a line by itself in the generated output.
 */
export const ROBOTS_GENERATED_MARKER = '# Standard: https://www.rfc-editor.org/rfc/rfc9309'

// Canonical blocklist of known free AI training scrapers (maintained by this project)
export const FREE_AI_SCRAPERS: readonly string[] = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'Google-Extended',
  'Gemini',
  'Applebot-Extended',
  'CCBot',
  'PerplexityBot',
  'YouBot',
  'Cohere-AI',
  'Bytespider',
  'PetalBot',
  'Diffbot',
  'FacebookBot',
  'Amazonbot',
  // ia_archiver intentionally NOT here — Internet Archive's Wayback Machine
  // is preservation, not AI training. Sites that want stricter policy can
  // add it via crawlers.additionalBlockList.
]

// Traditional search engine bots — always allowed unless overridden
export const SEARCH_ENGINE_BOTS: readonly string[] = [
  'Googlebot',
  'Bingbot',
  'Slurp',
  'DuckDuckBot',
  'Baiduspider',
  'YandexBot',
  'Twitterbot',
  'facebot',
]

// Reserved for paid agentic crawlers using this framework. Empty by default:
// when no real client UA exists in the wild, declaring one in every adopter's
// robots.txt looks self-referential and confusing (the only thing previously
// identifying as `AgentstxtBot` was herald's own `check` command). The
// infrastructure stays in place: adopters who want to admit a specific paid
// crawler can append to `crawlers.additionalAllowList` in their config, and
// the emission path below picks it up unchanged. When a real ecosystem-wide
// UA convention emerges, append the canonical identifier here.
// Follow-up tracked in agentify/CLAUDE.md.
export const PAID_AGENTIC_AGENTS: readonly string[] = []

/**
 * Generate a robots.txt string following RFC 9309.
 *
 * If `existingContent` is provided, the generated agentic rules are prepended
 * so existing human-authored rules remain intact at the bottom.
 */
export function generateRobotsTxt(
  config: AgenticConfig,
  existingContent?: string,
): string {
  const { site, content, crawlers = {} } = config

  const {
    blockFreeAiScrapers = true,
    allowSearchEngines = true,
    allowPaidAgents = true,
    customRules = [],
    additionalBlockList = [],
    additionalAllowList = [],
    additionalDirectives = [],
  } = crawlers

  const lines: string[] = []
  const blank = () => lines.push('')

  lines.push('# robots.txt')
  lines.push(ROBOTS_GENERATED_MARKER)
  blank()

  // ── Search engines ─────────────────────────────────────────────────────────
  if (allowSearchEngines) {
    lines.push('# Search engine crawlers')
    for (const bot of SEARCH_ENGINE_BOTS) {
      lines.push(`User-agent: ${bot}`)
    }
    lines.push('Allow: /')
    blank()
  }

  // ── Free AI scrapers (blocked) ─────────────────────────────────────────────
  if (blockFreeAiScrapers) {
    const blocklist = [...FREE_AI_SCRAPERS, ...additionalBlockList]
    lines.push('# Free AI training scrapers')
    for (const bot of blocklist) {
      lines.push(`User-agent: ${bot}`)
    }
    lines.push('Disallow: /')
    blank()
  }

  // ── Paid agentic agents (allowed through to x402 paywall) ─────────────────
  if (allowPaidAgents) {
    const allowlist = [...PAID_AGENTIC_AGENTS, ...additionalAllowList]
    if (allowlist.length > 0) {
      lines.push('# Paid agentic agents')
      for (const bot of allowlist) {
        lines.push(`User-agent: ${bot}`)
      }
      lines.push('Allow: /')
      blank()
    }
  } else if (additionalAllowList.length > 0) {
    lines.push('# Custom allowed agents')
    for (const bot of additionalAllowList) {
      lines.push(`User-agent: ${bot}`)
    }
    lines.push('Allow: /')
    blank()
  }

  // ── Custom rules ───────────────────────────────────────────────────────────
  for (const rule of customRules) {
    lines.push(`User-agent: ${rule.userAgent}`)
    for (const path of rule.allow ?? []) {
      lines.push(`Allow: ${path}`)
    }
    for (const path of rule.disallow ?? []) {
      lines.push(`Disallow: ${path}`)
    }
    if (rule.crawlDelay !== undefined) {
      lines.push(`Crawl-delay: ${rule.crawlDelay}`)
    }
    blank()
  }

  // ── Default wildcard rule ──────────────────────────────────────────────────
  lines.push('# Default')
  lines.push('User-agent: *')
  lines.push('Allow: /llms.txt')
  lines.push('Allow: /agents.txt')
  lines.push('Allow: /')
  blank()

  // ── Discovery references (widely-supported extensions) ─────────────────────
  const baseUrl = site.url.replace(/\/$/, '')

  if (content?.driver.type === 'sitemap') {
    const sitemapUrl = content.driver.sitemapUrl.startsWith('http')
      ? content.driver.sitemapUrl
      : `${baseUrl}${content.driver.sitemapUrl}`
    lines.push(`Sitemap: ${sitemapUrl}`)
  } else if (content?.driver.type === 'static' || content?.driver.type === 'manual') {
    // herald emits sitemap.xml at /sitemap.xml for these drivers (per the
    // CLI's emission policy). Reference it so crawlers don't have to guess.
    lines.push(`Sitemap: ${baseUrl}/sitemap.xml`)
  }
  // 'firecrawl' driver: no Sitemap: directive — herald skips emitting
  // sitemap.xml in that case (Firecrawl returns a curated subset, not authoritative).

  // No Agents-Txt: directive: per the agents.txt spec §4.3, the file is fixed
  // at <origin>/agents.txt, so the `Allow: /agents.txt` line above is sufficient
  // discovery. Emitting Agents-Txt: would duplicate that information.

  // ── Content-Signal (IETF AIPREF draft, CC0) ────────────────────────────────
  const search = allowSearchEngines !== false ? 'yes' : 'no'
  const aiSignal = blockFreeAiScrapers !== false ? 'no' : 'yes'
  lines.push(`Content-Signal: search=${search}, ai-train=${aiSignal}, ai-input=${aiSignal}`)

  // ── Adopter-supplied directives (e.g. NLWeb Schemamap:, Yandex Host:) ──────
  // Emitted verbatim, one per line, after the Content-Signal directive so
  // crawlers that pre-scan the top of the file find the standard directives
  // first. RFC 9309 ignores unknown directives; safe to publish with any
  // conforming crawler. Lines with leading/trailing whitespace are trimmed.
  for (const directive of additionalDirectives) {
    const trimmed = directive.trim()
    if (trimmed.length > 0) lines.push(trimmed)
  }

  // ── Merge with existing content ────────────────────────────────────────────
  if (existingContent?.trim()) {
    blank()
    lines.push('# ── Existing rules (preserved) ──────────────────────────────')
    lines.push(existingContent.trim())
  }

  return lines.join('\n') + '\n'
}
