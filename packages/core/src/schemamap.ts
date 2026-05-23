// ─────────────────────────────────────────────────────────────────────────────
// NLWeb Schema Map — /schemamap.xml
//
// XML document listing the schema-bearing surfaces the site publishes.
// NLWeb-aware crawlers walk this file to find typed content (JSON-LD,
// OpenAPI, agents.json, the ecosystem discovery files) without parsing HTML.
//
// Advertised from robots.txt via `Schemamap:` directive; herald users add
// that line via `crawlers.additionalDirectives`.
//
// Honest-declarations rule: the schema list is derived from which blocks the
// config actually declares. A site with no `mcp` block does not get an MCP
// server-card entry; a site without `payments.openapi` does not get an
// OpenAPI entry. Returns null when there are no schema-bearing surfaces to
// list (no agents.json would be emitted, no JSON-LD on the homepage).
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig } from './types.js'

interface SchemaEntry {
  loc: string
  types: string[]
  changefreq?: string
}

function siteOriginOf(config: AgenticConfig): string | null {
  try { return new URL(config.site.url).origin } catch { return null }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function generateSchemamapXml(config: AgenticConfig): string | null {
  const origin = siteOriginOf(config)
  if (!origin) return null

  const entries: SchemaEntry[] = []

  // Homepage always carries the WebSite + Organization + SoftwareApplication
  // JSON-LD graph that the BaseLayout emits across the deployment.
  entries.push({
    loc: `${origin}/`,
    types: [
      'https://schema.org/SoftwareApplication',
      'https://schema.org/Organization',
      'https://schema.org/WebSite',
    ],
    changefreq: 'weekly',
  })

  // agents.json — always emitted by herald when the config has any capability
  // block; references the JSON Schema URL as its "type".
  entries.push({
    loc: `${origin}/agents.json`,
    types: ['https://agents-txt.com/schema/agents-json/v1.0.json'],
    changefreq: 'weekly',
  })

  // Conditional: only list surfaces the site actually publishes.
  if (config.payments?.openapi) {
    entries.push({
      loc: `${origin}/openapi.json`,
      types: ['https://spec.openapis.org/oas/3.1.0'],
      changefreq: 'weekly',
    })
  }
  if (config.mcp || config.a2a || config.ucp) {
    entries.push({
      loc: `${origin}/.well-known/api-catalog`,
      types: ['https://www.rfc-editor.org/rfc/rfc9264.html'],
      changefreq: 'weekly',
    })
  }
  if (config.mcp?.serverCard) {
    entries.push({
      loc: `${origin}/.well-known/mcp/server-card.json`,
      types: ['https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127'],
      changefreq: 'weekly',
    })
  }
  if (config.a2a) {
    const cards = Array.isArray(config.a2a.cards) ? config.a2a.cards : [config.a2a.cards]
    for (const c of cards) {
      const url = typeof c === 'string' ? c : c.url
      entries.push({
        loc: url,
        types: ['https://a2a-protocol.org/AgentCard'],
        changefreq: 'weekly',
      })
    }
  }
  if (config.skills) {
    entries.push({
      loc: `${origin}/.well-known/agent-skills/index.json`,
      types: ['https://agentskills.io/discovery/0.2.0'],
      changefreq: 'weekly',
    })
  }

  if (entries.length === 0) return null

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<!--')
  lines.push(`  NLWeb Schema Map for ${esc(config.site.name)}.`)
  lines.push('  Lists the surfaces on this site that carry structured schema-bearing data')
  lines.push('  (JSON-LD, OpenAPI, agents.json, the ecosystem discovery files). NLWeb-aware')
  lines.push('  crawlers walk this file to find typed content without parsing HTML.')
  lines.push('  NLWeb: https://github.com/microsoft/nlweb')
  lines.push('-->')
  lines.push('<schemamap xmlns="https://schema.org/schemamap/0.1">')
  for (const e of entries) {
    lines.push('  <schema>')
    lines.push(`    <loc>${esc(e.loc)}</loc>`)
    for (const t of e.types) lines.push(`    <type>${esc(t)}</type>`)
    if (e.changefreq) lines.push(`    <changefreq>${esc(e.changefreq)}</changefreq>`)
    lines.push('  </schema>')
  }
  lines.push('</schemamap>')
  lines.push('')
  return lines.join('\n')
}
