// ─────────────────────────────────────────────────────────────────────────────
// API Catalog generator — /.well-known/api-catalog (RFC 9727)
//
// Builds an `application/linkset+json` document from the discovery URLs the
// config already declares. Each linkset entry uses the URL as its `anchor` and
// attaches `service-desc` / `service-doc` / `describedby` links pointing at the
// matching machine-readable spec or human documentation surface.
//
// Honest-declarations rule: only entries whose source field is present in the
// config are emitted. A site with no `mcp` block does not produce an MCP entry.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig } from './types.js'

interface CatalogLink {
  rel: string
  href: string
  type?: string
}

interface CatalogEntry {
  anchor: string
  links: CatalogLink[]
}

function urlOf(entry: string | { url: string }): string {
  return typeof entry === 'string' ? entry : entry.url
}

export function generateApiCatalog(config: AgenticConfig): string {
  const entries: CatalogEntry[] = []

  // MCP endpoints — each gets a describedby link to the SEP-2127 server card
  // and a service-doc link to the site's documentation hub when known.
  if (config.mcp) {
    const list = Array.isArray(config.mcp.endpoints) ? config.mcp.endpoints : [config.mcp.endpoints]
    const siteOrigin = (() => {
      try { return new URL(config.site.url).origin } catch { return null }
    })()
    for (const e of list) {
      const url = urlOf(e)
      const links: CatalogLink[] = []
      if (config.mcp.serverCard && siteOrigin) {
        // Same-origin convention: server card lives on the site at the
        // /.well-known path. Cross-origin MCP endpoints get no describedby
        // because we don't author the card.
        try {
          if (new URL(url).origin === siteOrigin) {
            links.push({
              rel: 'describedby',
              href: `${siteOrigin}/.well-known/mcp/server-card.json`,
              type: 'application/json',
            })
          }
        } catch { /* skip malformed URLs; config validator handles user errors */ }
      }
      links.push({ rel: 'service-doc', href: config.site.url })
      entries.push({ anchor: url, links })
    }
  }

  // A2A AgentCards — the card itself is the service descriptor (service-desc
  // points to the JSON; service-doc to the site).
  if (config.a2a) {
    const list = Array.isArray(config.a2a.cards) ? config.a2a.cards : [config.a2a.cards]
    for (const e of list) {
      const url = urlOf(e)
      entries.push({
        anchor: url,
        links: [
          { rel: 'service-desc', href: url, type: 'application/json' },
          { rel: 'service-doc',  href: config.site.url },
        ],
      })
    }
  }

  // UCP profiles — profile JSON is the descriptor; site is the docs surface.
  if (config.ucp) {
    const list = Array.isArray(config.ucp.profiles) ? config.ucp.profiles : [config.ucp.profiles]
    for (const e of list) {
      const url = urlOf(e)
      entries.push({
        anchor: url,
        links: [
          { rel: 'service-desc', href: url, type: 'application/json' },
          { rel: 'service-doc',  href: config.site.url },
        ],
      })
    }
  }

  return JSON.stringify({ linkset: entries }, null, 2) + '\n'
}
