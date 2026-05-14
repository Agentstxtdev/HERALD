import { describe, it, expect } from 'vitest'
import { generateApiCatalog } from '../api-catalog.js'
import type { AgenticConfig } from '../types.js'

const base: AgenticConfig = {
  site: { name: 'Example', url: 'https://example.com' },
}

function parse(out: string) {
  return JSON.parse(out) as { linkset: Array<{ anchor: string; links: Array<{ rel: string; href: string; type?: string }> }> }
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
    expect(linkset).toHaveLength(1)
    expect(linkset[0]!.anchor).toBe('https://example.com/mcp')
    expect(linkset[0]!.links.some((l) => l.rel === 'service-doc' && l.href === 'https://example.com')).toBe(true)
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
    const links = linkset[0]!.links
    expect(links.some((l) => l.rel === 'describedby' && l.href === 'https://example.com/.well-known/mcp/server-card.json')).toBe(true)
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
    expect(linkset[0]!.links.every((l) => l.rel !== 'describedby')).toBe(true)
  })

  it('does NOT attach describedby when serverCard is absent even on same-origin endpoints', () => {
    const out = generateApiCatalog({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'] },
    })
    expect(parse(out).linkset[0]!.links.every((l) => l.rel !== 'describedby')).toBe(true)
  })

  it('emits one entry per A2A card with service-desc + service-doc', () => {
    const out = generateApiCatalog({
      ...base,
      a2a: { cards: ['https://example.com/.well-known/agent-card.json'] },
    })
    const { linkset } = parse(out)
    expect(linkset).toHaveLength(1)
    expect(linkset[0]!.links.find((l) => l.rel === 'service-desc')?.type).toBe('application/json')
  })

  it('emits one entry per UCP profile with service-desc + service-doc', () => {
    const out = generateApiCatalog({
      ...base,
      ucp: { profiles: ['https://example.com/.well-known/ucp.json'] },
    })
    const { linkset } = parse(out)
    expect(linkset).toHaveLength(1)
    expect(linkset[0]!.links.find((l) => l.rel === 'service-desc')?.href).toBe('https://example.com/.well-known/ucp.json')
  })

  it('combines entries across mcp + a2a + ucp blocks in the same output', () => {
    const out = generateApiCatalog({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'] },
      a2a: { cards: ['https://example.com/agent-card.json'] },
      ucp: { profiles: ['https://example.com/ucp.json'] },
    })
    expect(parse(out).linkset).toHaveLength(3)
  })

  it('accepts entries given as objects with { url } as well as bare strings', () => {
    const out = generateApiCatalog({
      ...base,
      a2a: { cards: [{ url: 'https://example.com/card.json', description: 'demo' }] },
    })
    expect(parse(out).linkset[0]!.anchor).toBe('https://example.com/card.json')
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
