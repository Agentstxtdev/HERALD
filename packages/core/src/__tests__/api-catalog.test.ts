import { describe, it, expect } from 'vitest'
import { generateApiCatalog } from '../api-catalog.js'
import type { AgenticConfig } from '../types.js'

const base: AgenticConfig = {
  site: { name: 'Example', url: 'https://example.com' },
}

// RFC 9264 linkset shape: each anchor entry has `anchor` plus one property
// per link relation type (`service-desc`, `service-doc`, `describedby`,
// `item`), whose values are arrays of link target objects `{ href, type?, title? }`.
interface LinkTarget { href: string; type?: string; title?: string }
type AnchorEntry = { anchor: string } & Record<string, LinkTarget[] | string>

function parse(out: string): { linkset: AnchorEntry[] } {
  return JSON.parse(out) as { linkset: AnchorEntry[] }
}

// When any block is configured, the catalog leads with a self-entry whose
// `item` array enumerates the child anchors that follow. Helper to fish out
// the entry for a specific anchor URL.
function entryFor(linkset: AnchorEntry[], anchor: string): AnchorEntry | undefined {
  return linkset.find((e) => e.anchor === anchor)
}

describe('generateApiCatalog', () => {
  it('returns a linkset wrapper with an empty array when no blocks are configured', () => {
    const out = generateApiCatalog(base)
    expect(parse(out)).toEqual({ linkset: [] })
  })

  it('always ends with a single trailing newline', () => {
    const out = generateApiCatalog(base)
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })

  it('emits one entry per MCP endpoint with a service-doc link to the site', () => {
    const out = generateApiCatalog({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'] },
    })
    const { linkset } = parse(out)
    const entry = entryFor(linkset, 'https://example.com/mcp')
    expect(entry).toBeDefined()
    const docs = entry!['service-doc'] as LinkTarget[]
    expect(docs.some((l) => l.href === 'https://example.com')).toBe(true)
  })

  it('attaches a describedby link to the SEP-2127 server card on same-origin MCP endpoints when serverCard is configured', () => {
    const out = generateApiCatalog({
      ...base,
      mcp: {
        endpoints: ['https://example.com/mcp'],
        serverCard: { name: 'X', version: '1.0', capabilities: { tools: true, resources: false, prompts: false } },
      },
    })
    const { linkset } = parse(out)
    const entry = entryFor(linkset, 'https://example.com/mcp')!
    const described = entry['describedby'] as LinkTarget[] | undefined
    expect(described).toBeDefined()
    expect(described!.some((l) => l.href === 'https://example.com/.well-known/mcp/server-card.json')).toBe(true)
  })

  it('does NOT attach describedby for a cross-origin MCP endpoint (we cannot author its card)', () => {
    const out = generateApiCatalog({
      ...base,
      mcp: {
        endpoints: ['https://other.example/mcp'],
        serverCard: { name: 'X', version: '1.0', capabilities: { tools: true, resources: false, prompts: false } },
      },
    })
    const { linkset } = parse(out)
    const entry = entryFor(linkset, 'https://other.example/mcp')!
    expect(entry['describedby']).toBeUndefined()
  })

  it('does NOT attach describedby when serverCard is absent even on same-origin endpoints', () => {
    const out = generateApiCatalog({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'] },
    })
    const { linkset } = parse(out)
    const entry = entryFor(linkset, 'https://example.com/mcp')!
    expect(entry['describedby']).toBeUndefined()
  })

  it('emits one entry per A2A card with service-desc + service-doc', () => {
    const out = generateApiCatalog({
      ...base,
      a2a: { cards: ['https://example.com/.well-known/agent-card.json'] },
    })
    const { linkset } = parse(out)
    const entry = entryFor(linkset, 'https://example.com/.well-known/agent-card.json')!
    const desc = entry['service-desc'] as LinkTarget[]
    expect(desc[0]?.type).toBe('application/json')
  })

  it('emits one entry per UCP profile with service-desc + service-doc', () => {
    const out = generateApiCatalog({
      ...base,
      ucp: { profiles: ['https://example.com/.well-known/ucp.json'] },
    })
    const { linkset } = parse(out)
    const entry = entryFor(linkset, 'https://example.com/.well-known/ucp.json')!
    const desc = entry['service-desc'] as LinkTarget[]
    expect(desc[0]?.href).toBe('https://example.com/.well-known/ucp.json')
  })

  it('combines entries across mcp + a2a + ucp blocks in the same output', () => {
    const out = generateApiCatalog({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'] },
      a2a: { cards: ['https://example.com/agent-card.json'] },
      ucp: { profiles: ['https://example.com/ucp.json'] },
    })
    const { linkset } = parse(out)
    // 1 catalog summary entry + 3 anchor entries
    expect(linkset).toHaveLength(4)
    expect(entryFor(linkset, 'https://example.com/mcp')).toBeDefined()
    expect(entryFor(linkset, 'https://example.com/agent-card.json')).toBeDefined()
    expect(entryFor(linkset, 'https://example.com/ucp.json')).toBeDefined()
  })

  it('the catalog self-entry enumerates child anchors via the item relation', () => {
    const out = generateApiCatalog({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'] },
      a2a: { cards: ['https://example.com/agent-card.json'] },
    })
    const { linkset } = parse(out)
    const self = entryFor(linkset, 'https://example.com/.well-known/api-catalog')!
    const items = self['item'] as LinkTarget[]
    expect(items).toBeDefined()
    expect(items.map((i) => i.href)).toEqual(
      expect.arrayContaining([
        'https://example.com/mcp',
        'https://example.com/agent-card.json',
      ]),
    )
  })

  it('accepts entries given as objects with { url } as well as bare strings', () => {
    const out = generateApiCatalog({
      ...base,
      a2a: { cards: [{ url: 'https://example.com/card.json', description: 'demo' }] },
    })
    const { linkset } = parse(out)
    const entry = entryFor(linkset, 'https://example.com/card.json')
    expect(entry).toBeDefined()
  })

  it('skips describedby for a malformed MCP endpoint URL without throwing', () => {
    expect(() =>
      generateApiCatalog({
        ...base,
        mcp: {
          endpoints: ['not-a-url'],
          serverCard: { name: 'X', version: '1.0', capabilities: { tools: true, resources: false, prompts: false } },
        },
      }),
    ).not.toThrow()
  })
})
