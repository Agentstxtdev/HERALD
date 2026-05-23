import { describe, it, expect } from 'vitest'
import { generateSchemamapXml } from '../schemamap.js'
import type { AgenticConfig } from '../types.js'

const baseSite = { name: 'Example', url: 'https://example.com' }

describe('generateSchemamapXml', () => {
  it('returns null when site URL cannot be parsed', () => {
    expect(generateSchemamapXml({ site: { name: 'x', url: 'not-a-url' } })).toBeNull()
  })

  it('always lists the homepage with WebSite + Organization + SoftwareApplication types', () => {
    const out = generateSchemamapXml({ site: baseSite })!
    expect(out).toContain('<loc>https://example.com/</loc>')
    expect(out).toContain('https://schema.org/SoftwareApplication')
    expect(out).toContain('https://schema.org/Organization')
    expect(out).toContain('https://schema.org/WebSite')
  })

  it('lists agents.json with the JSON Schema as its type', () => {
    const out = generateSchemamapXml({ site: baseSite })!
    expect(out).toContain('<loc>https://example.com/agents.json</loc>')
    expect(out).toContain('https://agents-txt.com/schema/agents-json/v1.0.json')
  })

  it('lists /openapi.json only when payments.openapi.paths is declared', () => {
    const without = generateSchemamapXml({ site: baseSite })!
    expect(without).not.toContain('openapi.json')
    const withOpenApi = generateSchemamapXml({
      site: baseSite,
      payments: {
        protocols: ['x402'],
        openapi: { paths: { '/x': { offers: [{ intent: 'charge', method: 'x402', amount: '1', currency: 'USDC' }] } } },
      },
    })!
    expect(withOpenApi).toContain('https://example.com/openapi.json')
    expect(withOpenApi).toContain('https://spec.openapis.org/oas/3.1.0')
  })

  it('lists /.well-known/api-catalog when any of mcp / a2a / ucp is configured', () => {
    const out = generateSchemamapXml({
      site: baseSite,
      mcp: { endpoints: 'https://example.com/mcp' },
    })!
    expect(out).toContain('/.well-known/api-catalog')
  })

  it('lists /.well-known/mcp/server-card.json only when serverCard is set', () => {
    const without = generateSchemamapXml({
      site: baseSite,
      mcp: { endpoints: 'https://example.com/mcp' },
    })!
    expect(without).not.toContain('/.well-known/mcp/server-card.json')
    const withCard = generateSchemamapXml({
      site: baseSite,
      mcp: {
        endpoints: 'https://example.com/mcp',
        serverCard: { name: 'X', version: '1.0', capabilities: { tools: true, resources: false, prompts: false } },
      },
    })!
    expect(withCard).toContain('/.well-known/mcp/server-card.json')
  })

  it('lists each A2A AgentCard URL declared in a2a.cards', () => {
    const out = generateSchemamapXml({
      site: baseSite,
      a2a: { cards: ['https://example.com/.well-known/agent-card.json'] },
    })!
    expect(out).toContain('https://example.com/.well-known/agent-card.json')
    expect(out).toContain('https://a2a-protocol.org/AgentCard')
  })

  it('escapes XML metacharacters in URLs and the site name', () => {
    const out = generateSchemamapXml({ site: { name: 'A & B <co>', url: 'https://example.com' } })!
    expect(out).toContain('A &amp; B &lt;co&gt;')
  })

  it('ends with a single trailing newline', () => {
    const out = generateSchemamapXml({ site: baseSite })!
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})
