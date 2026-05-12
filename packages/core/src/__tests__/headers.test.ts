import { describe, it, expect } from 'vitest'
import {
  generateHeadersFile,
  headersDevSnippet,
  matchHeadersForPath,
  mergeVercelHeaders,
  parseHeadersFile,
  parseVercelHeaders,
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

describe('headers generators with UCP profile config', () => {
  it('adds an entry for a same-origin UCP profile path (_headers)', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      ucp: { profiles: 'https://test.example/.well-known/ucp' },
    }
    const f = generateHeadersFile('cloudflare', config)
    expect(f.content).toContain('/.well-known/ucp')
    expect(f.content).toMatch(/\/\.well-known\/ucp\n\s*Content-Type: application\/json\n\s*Access-Control-Allow-Origin: \*/)
  })

  it('adds matching entries for every same-origin profile in profiles[]', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      ucp: {
        profiles: [
          'https://test.example/.well-known/ucp',
          { url: 'https://test.example/profiles/b2b.json', description: 'B2B' },
        ],
      },
    }
    const entries = vercelHeaderEntries(config)
    const sources = entries.map((e) => e.source).sort()
    expect(sources).toEqual([
      '/.well-known/ucp',
      '/agents.json',
      '/agents.txt',
      '/profiles/b2b.json',
    ])
  })

  it('skips UCP profiles on a different origin from site.url', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      ucp: {
        profiles: [
          'https://test.example/.well-known/ucp',
          'https://other.example/.well-known/ucp',
        ],
      },
    }
    const entries = vercelHeaderEntries(config)
    const sources = entries.map((e) => e.source)
    expect(sources).toContain('/.well-known/ucp')
    expect(sources.filter((s) => s.endsWith('/ucp'))).toHaveLength(1)
  })

  it('deduplicates identical profile paths', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      ucp: {
        profiles: [
          'https://test.example/.well-known/ucp',
          { url: 'https://test.example/.well-known/ucp' },
        ],
      },
    }
    const entries = vercelHeaderEntries(config)
    expect(entries.filter((e) => e.source === '/.well-known/ucp')).toHaveLength(1)
  })

  it('emits both A2A and UCP entries together when both are configured', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      a2a: { cards: 'https://test.example/.well-known/agent-card.json' },
      ucp: { profiles: 'https://test.example/.well-known/ucp' },
    }
    const entries = vercelHeaderEntries(config)
    const sources = entries.map((e) => e.source).sort()
    expect(sources).toEqual([
      '/.well-known/agent-card.json',
      '/.well-known/ucp',
      '/agents.json',
      '/agents.txt',
    ])
  })

  it('emits /llms.txt entry when config.content is set, with text/plain + charset', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      content: { driver: { type: 'sitemap', sitemapUrl: 'https://test.example/sitemap.xml' } },
    }
    const entries = vercelHeaderEntries(config)
    const llms = entries.find((e) => e.source === '/llms.txt')
    expect(llms).toBeDefined()
    expect(llms!.headers).toEqual([
      { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Cache-Control', value: 'public, max-age=3600' },
    ])
    expect(entries.find((e) => e.source === '/llms-full.txt')).toBeUndefined()
  })

  it('emits /llms-full.txt entry only when content.fullTxt is set', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      content: {
        driver: { type: 'sitemap', sitemapUrl: 'https://test.example/sitemap.xml' },
        fullTxt: { driver: { type: 'sitemap', sitemapUrl: 'https://test.example/sitemap.xml' } },
      },
    }
    const sources = vercelHeaderEntries(config).map((e) => e.source)
    expect(sources).toContain('/llms.txt')
    expect(sources).toContain('/llms-full.txt')
  })

  it('does NOT emit llms.txt entries when config.content is absent', () => {
    const entries = vercelHeaderEntries(baseConfig)
    const sources = entries.map((e) => e.source)
    expect(sources).not.toContain('/llms.txt')
    expect(sources).not.toContain('/llms-full.txt')
  })

  it('emits a /skills/* glob for same-origin skill URLs, with text/markdown + charset', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      skills: { urls: 'https://test.example/skills/adopt-agents-txt/SKILL.md' },
    }
    const entries = vercelHeaderEntries(config)
    const skills = entries.find((e) => e.source === '/skills/*')
    expect(skills).toBeDefined()
    expect(skills!.headers).toEqual([
      { key: 'Content-Type', value: 'text/markdown; charset=utf-8' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Cache-Control', value: 'public, max-age=3600' },
    ])
  })

  it('collapses multiple same-origin skills under the same first segment to one glob', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      skills: { urls: [
        'https://test.example/skills/foo/SKILL.md',
        'https://test.example/skills/bar/SKILL.md',
      ] },
    }
    const entries = vercelHeaderEntries(config)
    expect(entries.filter((e) => e.source === '/skills/*')).toHaveLength(1)
  })

  it('skips cross-origin skill URLs', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      skills: { urls: 'https://other.example/skills/foo/SKILL.md' },
    }
    const entries = vercelHeaderEntries(config)
    expect(entries.find((e) => e.source.startsWith('/skills'))).toBeUndefined()
  })

  it('derives the glob from the URL\'s first path segment (not hardcoded /skills/)', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      skills: { urls: 'https://test.example/help/foo/SKILL.md' },
    }
    const entries = vercelHeaderEntries(config)
    expect(entries.find((e) => e.source === '/help/*')).toBeDefined()
  })

  it('emits llms + skills + A2A + UCP entries together with the §4.5 base', () => {
    const config: AgenticConfig = {
      ...baseConfig,
      content: { driver: { type: 'sitemap', sitemapUrl: 'https://test.example/sitemap.xml' } },
      a2a: { cards: 'https://test.example/.well-known/agent-card.json' },
      ucp: { profiles: 'https://test.example/.well-known/ucp' },
      skills: { urls: 'https://test.example/skills/foo/SKILL.md' },
    }
    const sources = vercelHeaderEntries(config).map((e) => e.source).sort()
    expect(sources).toEqual([
      '/.well-known/agent-card.json',
      '/.well-known/ucp',
      '/agents.json',
      '/agents.txt',
      '/llms.txt',
      '/skills/*',
    ])
  })

  it('mergeVercelHeaders preserves unrelated entries when extra UCP entries are added', () => {
    const userEntry: VercelHeaderEntry = {
      source: '/api/(.*)',
      headers: [{ key: 'X-Custom', value: 'yes' }],
    }
    const config: AgenticConfig = {
      ...baseConfig,
      ucp: { profiles: 'https://test.example/.well-known/ucp' },
    }
    const merged = mergeVercelHeaders([userEntry], config)
    expect(merged).toContainEqual(userEntry)
    expect(merged.map((e) => e.source)).toContain('/.well-known/ucp')
  })
})

describe('parseHeadersFile', () => {
  it('round-trips against generateHeadersFile output', () => {
    const generated = generateHeadersFile('cloudflare').content
    const rules = parseHeadersFile(generated)
    const sources = rules.map((r) => r.source)
    expect(sources).toEqual(['/agents.txt', '/agents.json'])
    const agentsTxt = rules[0]!
    expect(agentsTxt.headers).toEqual([
      { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Cache-Control', value: 'public, max-age=3600' },
    ])
  })

  it('ignores comment and blank lines', () => {
    const rules = parseHeadersFile(
      '# comment\n\n/foo\n  X-A: 1\n\n# another\n/bar\n  X-B: 2\n',
    )
    expect(rules).toHaveLength(2)
    expect(rules[0]!.source).toBe('/foo')
    expect(rules[1]!.headers[0]).toEqual({ key: 'X-B', value: '2' })
  })

  it('drops rules with no headers', () => {
    const rules = parseHeadersFile('/orphan\n\n/real\n  X: y\n')
    expect(rules.map((r) => r.source)).toEqual(['/real'])
  })

  it('returns an empty array for empty input', () => {
    expect(parseHeadersFile('')).toEqual([])
  })
})

describe('parseVercelHeaders', () => {
  it('parses a vercel.json object with headers[]', () => {
    const rules = parseVercelHeaders({
      headers: [
        { source: '/agents.txt', headers: [{ key: 'Content-Type', value: 'text/plain' }] },
      ],
    })
    expect(rules).toEqual([
      { source: '/agents.txt', headers: [{ key: 'Content-Type', value: 'text/plain' }] },
    ])
  })

  it('parses a raw JSON string', () => {
    const rules = parseVercelHeaders(
      JSON.stringify({ headers: [{ source: '/x', headers: [{ key: 'A', value: 'b' }] }] }),
    )
    expect(rules).toHaveLength(1)
  })

  it('returns [] for malformed JSON, missing headers, or non-object input', () => {
    expect(parseVercelHeaders('not json')).toEqual([])
    expect(parseVercelHeaders({})).toEqual([])
    expect(parseVercelHeaders(null)).toEqual([])
    expect(parseVercelHeaders({ headers: 'oops' })).toEqual([])
  })

  it('skips entries with no valid key/value pairs', () => {
    const rules = parseVercelHeaders({
      headers: [
        { source: '/a', headers: [{ key: 'X', value: 'y' }] },
        { source: '/b', headers: [{ key: 1, value: 2 }] },
        { source: '/c' },
      ],
    })
    expect(rules.map((r) => r.source)).toEqual(['/a'])
  })
})

describe('matchHeadersForPath', () => {
  const rules = [
    { source: '/agents.txt', headers: [{ key: 'Content-Type', value: 'text/plain' }] },
    { source: '/agents.json', headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
    ] },
    { source: '/blog/*', headers: [{ key: 'X-Blog', value: '1' }] },
  ]

  it('matches exact paths and returns lowercased keys', () => {
    expect(matchHeadersForPath(rules, '/agents.txt')).toEqual({ 'content-type': 'text/plain' })
    expect(matchHeadersForPath(rules, '/agents.json')).toEqual({
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    })
  })

  it('matches wildcard sources', () => {
    expect(matchHeadersForPath(rules, '/blog/hello')).toEqual({ 'x-blog': '1' })
    expect(matchHeadersForPath(rules, '/blog/deep/path')).toEqual({ 'x-blog': '1' })
  })

  it('returns {} for non-matching paths', () => {
    expect(matchHeadersForPath(rules, '/other')).toEqual({})
  })

  it('later rules override earlier ones on key collision', () => {
    const overlap = [
      { source: '/x', headers: [{ key: 'A', value: 'first' }] },
      { source: '/x', headers: [{ key: 'A', value: 'second' }] },
    ]
    expect(matchHeadersForPath(overlap, '/x')).toEqual({ a: 'second' })
  })
})

describe('headersDevSnippet', () => {
  it('returns an Astro snippet referencing the Vite plugin', () => {
    const s = headersDevSnippet('astro')
    expect(s).toContain('astro.config.mjs')
    expect(s).toContain('heraldHeadersVitePlugin')
    expect(s).toContain('@herald/addon/dev')
  })

  it('returns a Vite snippet for vite and sveltekit', () => {
    expect(headersDevSnippet('vite')).toContain('vite.config.ts')
    expect(headersDevSnippet('sveltekit')).toContain('vite.config.ts')
  })

  it('returns the Connect middleware for express', () => {
    const s = headersDevSnippet('express')
    expect(s).toContain('heraldHeadersConnect')
    expect(s).toContain('app.use(')
  })

  it('returns the Hono middleware for hono', () => {
    const s = headersDevSnippet('hono')
    expect(s).toContain('heraldHeadersHono')
    expect(s).toContain("app.use('*'")
  })

  it('points Next.js users at native headers() API, not a herald shim', () => {
    const s = headersDevSnippet('nextjs')
    expect(s).toContain('next.config.js')
    expect(s).toContain('async headers()')
    expect(s).not.toContain('heraldHeadersVitePlugin')
  })

  it('returns a generic guide for unknown frameworks', () => {
    const s = headersDevSnippet('unknown')
    expect(s).toContain('heraldHeadersVitePlugin')
    expect(s).toContain('heraldHeadersConnect')
    expect(s).toContain('heraldHeadersHono')
  })
})
