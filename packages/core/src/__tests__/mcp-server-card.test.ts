import { describe, it, expect } from 'vitest'
import { generateMcpServerCard } from '../mcp-server-card.js'
import type { AgenticConfig } from '../types.js'

const base: AgenticConfig = {
  site: { name: 'Example', url: 'https://example.com' },
}

const cardFields = {
  name:    'Example MCP',
  version: '1.0.0',
  capabilities: { tools: true, resources: false, prompts: true },
}

describe('generateMcpServerCard', () => {
  it('returns null when mcp block is absent', () => {
    expect(generateMcpServerCard(base)).toBeNull()
  })

  it('returns null when mcp.serverCard is absent (honest-declarations rule)', () => {
    expect(generateMcpServerCard({ ...base, mcp: { endpoints: ['https://example.com/mcp'] } })).toBeNull()
  })

  it('returns null when serverCard is configured but no endpoint exists', () => {
    expect(generateMcpServerCard({
      ...base,
      mcp: { endpoints: [], serverCard: cardFields },
    } as AgenticConfig)).toBeNull()
  })

  it('emits a SEP-2127-shaped JSON document with serverInfo + transport + capabilities', () => {
    const out = generateMcpServerCard({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'], serverCard: cardFields },
    })!
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out)
    expect(parsed.serverInfo).toEqual({ name: 'Example MCP', version: '1.0.0' })
    expect(parsed.transport).toEqual({ endpoint: 'https://example.com/mcp', type: 'streamable-http' })
    expect(parsed.capabilities).toEqual({ tools: true, resources: false, prompts: true })
  })

  it('uses the first endpoint when multiple are configured', () => {
    const out = generateMcpServerCard({
      ...base,
      mcp: {
        endpoints: ['https://example.com/mcp', 'https://example.com/mcp-v2'],
        serverCard: cardFields,
      },
    })!
    expect(JSON.parse(out).transport.endpoint).toBe('https://example.com/mcp')
  })

  it('accepts endpoints given as objects with { url }', () => {
    const out = generateMcpServerCard({
      ...base,
      mcp: {
        endpoints: [{ url: 'https://example.com/mcp', description: 'main' }],
        serverCard: cardFields,
      },
    })!
    expect(JSON.parse(out).transport.endpoint).toBe('https://example.com/mcp')
  })

  it('always ends with a single trailing newline', () => {
    const out = generateMcpServerCard({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'], serverCard: cardFields },
    })!
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })

  it('hard-codes transport.type to "streamable-http"', () => {
    const out = generateMcpServerCard({
      ...base,
      mcp: { endpoints: ['https://example.com/mcp'], serverCard: cardFields },
    })!
    expect(JSON.parse(out).transport.type).toBe('streamable-http')
  })
})
