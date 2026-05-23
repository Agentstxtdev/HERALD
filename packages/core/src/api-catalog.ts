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

// RFC 9264 (Linkset+JSON) shape: each anchor entry uses link-relation type
// keys as properties (e.g. "service-desc", "describedby", "item"), whose
// values are arrays of link target objects. We model that internally so the
// emitted JSON matches what RFC 9727 readers expect.
interface CatalogTarget {
  href: string
  type?: string
  title?: string
}

type CatalogEntry = { anchor: string } & Record<string, CatalogTarget[] | string>

function urlOf(entry: string | { url: string }): string {
  return typeof entry === 'string' ? entry : entry.url
}

function descriptionOf(entry: string | { url: string; description?: string }): string | undefined {
  return typeof entry === 'string' ? undefined : entry.description
}

function append(rels: Record<string, CatalogTarget[]>, rel: string, target: CatalogTarget) {
  if (!rels[rel]) rels[rel] = []
  rels[rel].push(target)
}

function buildEntry(anchor: string, rels: Record<string, CatalogTarget[]>): CatalogEntry {
  const entry = { anchor } as CatalogEntry
  for (const [rel, targets] of Object.entries(rels)) entry[rel] = targets
  return entry
}

export function generateApiCatalog(config: AgenticConfig): string {
  const entries: CatalogEntry[] = []
  const siteOrigin = (() => {
    try { return new URL(config.site.url).origin } catch { return null }
  })()

  // Top-level catalog entry: the site itself. The `item` relation lists the
  // anchors that follow as child resources, which is what RFC 9727 readers
  // expect at linkset[0] to enumerate the catalog's contents.
  const catalogAnchor = siteOrigin ?? config.site.url
  const catalogRels: Record<string, CatalogTarget[]> = {}
  const catalogItems: CatalogTarget[] = []

  // MCP endpoints — each gets a describedby link to the SEP-2127 server card
  // and a service-doc link to the site's documentation hub when known.
  if (config.mcp) {
    const list = Array.isArray(config.mcp.endpoints) ? config.mcp.endpoints : [config.mcp.endpoints]
    for (const e of list) {
      const url = urlOf(e)
      const desc = descriptionOf(e)
      const rels: Record<string, CatalogTarget[]> = {}
      if (config.mcp.serverCard && siteOrigin) {
        // Same-origin convention: server card lives on the site at the
        // /.well-known path. Cross-origin MCP endpoints get no describedby
        // because we don't author the card.
        try {
          if (new URL(url).origin === siteOrigin) {
            append(rels, 'describedby', {
              href: `${siteOrigin}/.well-known/mcp/server-card.json`,
              type: 'application/json',
            })
          }
        } catch { /* skip malformed URLs; config validator handles user errors */ }
      }
      append(rels, 'service-doc', { href: config.site.url })
      entries.push(buildEntry(url, rels))
      catalogItems.push({ href: url, type: 'application/json', ...(desc ? { title: desc } : {}) })
    }
  }

  // A2A AgentCards — the card itself is the service descriptor (service-desc
  // points to the JSON; service-doc to the site).
  if (config.a2a) {
    const list = Array.isArray(config.a2a.cards) ? config.a2a.cards : [config.a2a.cards]
    for (const e of list) {
      const url = urlOf(e)
      const desc = descriptionOf(e)
      entries.push(buildEntry(url, {
        'service-desc': [{ href: url, type: 'application/json' }],
        'service-doc':  [{ href: config.site.url }],
      }))
      catalogItems.push({ href: url, type: 'application/json', ...(desc ? { title: desc } : {}) })
    }
  }

  // UCP profiles — profile JSON is the descriptor; site is the docs surface.
  if (config.ucp) {
    const list = Array.isArray(config.ucp.profiles) ? config.ucp.profiles : [config.ucp.profiles]
    for (const e of list) {
      const url = urlOf(e)
      const desc = descriptionOf(e)
      entries.push(buildEntry(url, {
        'service-desc': [{ href: url, type: 'application/json' }],
        'service-doc':  [{ href: config.site.url }],
      }))
      catalogItems.push({ href: url, type: 'application/json', ...(desc ? { title: desc } : {}) })
    }
  }

  // Surface OpenAPI as a top-level item when declared, so consumers walking
  // the catalog discover it without parsing the Link: header on /.
  if (config.payments?.openapi && siteOrigin) {
    catalogItems.push({ href: `${siteOrigin}/openapi.json`, type: 'application/json' })
  }

  if (catalogItems.length > 0) catalogRels.item = catalogItems

  // The catalog's own entry leads the list per RFC 9727 convention so readers
  // hit linkset[0] and see the item[] enumeration immediately.
  const ordered: CatalogEntry[] = catalogItems.length > 0
    ? [buildEntry(`${catalogAnchor}/.well-known/api-catalog`, catalogRels), ...entries]
    : entries

  return JSON.stringify({ linkset: ordered }, null, 2) + '\n'
}
