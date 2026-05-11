import { describe, it, expect } from 'vitest'
import {
  generateHeadersFile,
  mergeVercelHeaders,
  vercelHeaderEntries,
  type VercelHeaderEntry,
} from '../headers.js'
import type { AgenticConfig } from '../types.js'

const baseConfig: AgenticConfig = {
  site: { name: 'Test', url: 'https://test.example' },
}

describe('generateHeadersFile', () => {
  it('emits a `_headers` file at the public dir for cloudflare', () => {
    const f = generateHeadersFile('cloudflare')
    expect(f.filename).toBe('_headers')
    expect(f.pathRelativeTo).toBe('out')
    expect(f.strategy).toBe('overwrite')
    expect(f.content).toContain('/agents.txt')
    expect(f.content).toContain('/agents.json')
    expect(f.content).toContain('Content-Type: text/plain; charset=utf-8')
    expect(f.content).toContain('Content-Type: application/json')
    expect(f.content).toContain('Access-Control-Allow-Origin: *')
    expect(f.content).toContain('Cache-Control: public, max-age=3600')
  })

  it('emits the same `_headers` file for netlify (identical syntax)', () => {
    const cf = generateHeadersFile('cloudflare')
    const nl = generateHeadersFile('netlify')
    expect(nl.filename).toBe(cf.filename)
    expect(nl.content).toBe(cf.content)
    expect(nl.strategy).toBe(cf.strategy)
  })

  it('emits a project-root `vercel.json` for vercel with merge-json strategy', () => {
    const f = generateHeadersFile('vercel')
    expect(f.filename).toBe('vercel.json')
    expect(f.pathRelativeTo).toBe('project-root')
    expect(f.strategy).toBe('merge-json')
    const parsed = JSON.parse(f.content) as { headers: VercelHeaderEntry[] }
    expect(parsed.headers).toHaveLength(2)
    expect(parsed.headers.map((e) => e.source).sort()).toEqual(['/agents.json', '/agents.txt'])
  })

  it('falls back to `_headers` for unknown platform (best-effort default)', () => {
    const f = generateHeadersFile('unknown')
    expect(f.filename).toBe('_headers')
    expect(f.pathRelativeTo).toBe('out')
  })
})

describe('mergeVercelHeaders', () => {
  it('writes both /agents.txt and /agents.json entries when input is empty', () => {
    const merged = mergeVercelHeaders([])
    expect(merged.map((e) => e.source).sort()).toEqual(['/agents.json', '/agents.txt'])
  })

  it('preserves unrelated entries verbatim', () => {
    const userEntry: VercelHeaderEntry = {
      source: '/api/(.*)',
      headers: [{ key: 'X-Custom', value: 'yes' }],
    }
    const merged = mergeVercelHeaders([userEntry])
    expect(merged).toContainEqual(userEntry)
    expect(merged).toHaveLength(3)
  })

  it('replaces colliding entries with the §4.5 values (we own those paths)', () => {
    const stale: VercelHeaderEntry = {
      source: '/agents.txt',
      headers: [{ key: 'Content-Type', value: 'application/octet-stream' }],
    }
    const merged = mergeVercelHeaders([stale])
    const agentsTxt = merged.find((e) => e.source === '/agents.txt')!
    expect(agentsTxt.headers).toEqual(vercelHeaderEntries().find((e) => e.source === '/agents.txt')!.headers)
  })

  it('handles a non-array input gracefully (treats as empty)', () => {
    expect(mergeVercelHeaders(undefined).map((e) => e.source).sort()).toEqual(['/agents.json', '/agents.txt'])
    expect(mergeVercelHeaders(null).map((e) => e.source).sort()).toEqual(['/agents.json', '/agents.txt'])
    expect(mergeVercelHeaders('garbage' as unknown).map((e) => e.source).sort()).toEqual(['/agents.json', '/agents.txt'])
  })
})

describe('headers generators with A2A AgentCard config', () => {
  it('adds an entry for a same-origin AgentCard path (_headers)', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      a2a: { cards: 'https://test.example/.well-known/agent-card.json' },
    }
    const f = generateHeadersFile('cloudflare', config)
    expect(f.content).toContain('/.well-known/agent-card.json')
    expect(f.content).toMatch(/\/\.well-known\/agent-card\.json\n\s*Content-Type: application\/json\n\s*Access-Control-Allow-Origin: \*/)
  })

  it('adds matching entries for every same-origin AgentCard in cards[]', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      a2a: {
        cards: [
          'https://test.example/.well-known/agent-card.json',
          { url: 'https://test.example/agents/support/card.json', description: 'Support' },
        ],
      },
    }
    const entries = vercelHeaderEntries(config)
    const sources = entries.map((e) => e.source).sort()
    expect(sources).toEqual([
      '/.well-known/agent-card.json',
      '/agents.json',
      '/agents.txt',
      '/agents/support/card.json',
    ])
  })

  it('skips AgentCards on a different origin from site.url', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      a2a: {
        cards: [
          'https://test.example/.well-known/agent-card.json',
          'https://other.example/.well-known/agent-card.json',
        ],
      },
    }
    const entries = vercelHeaderEntries(config)
    const sources = entries.map((e) => e.source)
    expect(sources).toContain('/.well-known/agent-card.json')
    expect(sources.filter((s) => s.endsWith('agent-card.json'))).toHaveLength(1)
  })

  it('deduplicates identical AgentCard paths', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      a2a: {
        cards: [
          'https://test.example/.well-known/agent-card.json',
          { url: 'https://test.example/.well-known/agent-card.json' },
        ],
      },
    }
    const entries = vercelHeaderEntries(config)
    expect(entries.filter((e) => e.source === '/.well-known/agent-card.json')).toHaveLength(1)
  })

  it('still emits the §4.5 base entries when no config is provided', () => {
    const entries = vercelHeaderEntries()
    expect(entries.map((e) => e.source).sort()).toEqual(['/agents.json', '/agents.txt'])
  })

  it('mergeVercelHeaders preserves unrelated entries when extra A2A entries are added', () => {
    const userEntry: VercelHeaderEntry = {
      source: '/api/(.*)',
      headers: [{ key: 'X-Custom', value: 'yes' }],
    }
    const config: AgenticConfig = {
      ...baseConfig,
      a2a: { cards: 'https://test.example/.well-known/agent-card.json' },
    }
    const merged = mergeVercelHeaders([userEntry], config)
    expect(merged).toContainEqual(userEntry)
    expect(merged.map((e) => e.source)).toContain('/.well-known/agent-card.json')
  })
})
