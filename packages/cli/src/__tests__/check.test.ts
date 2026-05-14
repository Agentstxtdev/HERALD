import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkCompliance } from '../commands/check.js'

type FetchResponse = { status: number; body: string }
type FetchMap = Record<string, FetchResponse>

function installFetch(map: FetchMap) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const url = typeof input === 'string' ? input : input.url
    const entry = map[url] ?? { status: 404, body: '' }
    return new Response(entry.body, { status: entry.status })
  })
}

const logSpy = () => vi.spyOn(console, 'log').mockImplementation(() => {})
const errSpy = () => vi.spyOn(console, 'error').mockImplementation(() => {})
const exitSpy = () =>
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`__exit__:${code}`)
  }) as unknown as typeof process.exit)

afterEach(() => vi.restoreAllMocks())

describe('checkCompliance — URL handling', () => {
  beforeEach(() => { errSpy(); logSpy() })

  it('rejects URLs without an http(s) scheme via process.exit(1)', async () => {
    exitSpy()
    await expect(checkCompliance('ftp://example.com')).rejects.toThrow(/__exit__:1/)
  })

  it('rejects malformed URLs', async () => {
    exitSpy()
    await expect(checkCompliance('not a url')).rejects.toThrow(/__exit__:1/)
  })

  it('strips a trailing slash from the input URL pathname', async () => {
    logSpy()
    const fetchSpy = installFetch({}) // every request 404s
    await checkCompliance('https://example.com/')
    const seen = fetchSpy.mock.calls.map((c) => c[0])
    expect(seen).toContain('https://example.com/robots.txt')
    expect(seen).not.toContain('https://example.com//robots.txt')
  })
})

describe('checkCompliance — output formatting', () => {
  it('prints one line per audited file plus a Score footer', async () => {
    const log = logSpy()
    installFetch({}) // everything 404s
    await checkCompliance('https://example.com')
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n')
    // 5 files audited: robots.txt, llms.txt, agents.txt, agents.json, sitemap.xml
    expect(printed).toMatch(/robots\.txt/)
    expect(printed).toMatch(/llms\.txt/)
    expect(printed).toMatch(/agents\.txt/)
    expect(printed).toMatch(/agents\.json/)
    expect(printed).toMatch(/sitemap\.xml/)
    expect(printed).toMatch(/Score: 0\/5/)
  })

  it('prints the "run `herald emit` to generate missing files" hint when score < total', async () => {
    const log = logSpy()
    installFetch({})
    await checkCompliance('https://example.com')
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toMatch(/herald emit/)
  })

  it('prints the celebration banner when every file passes', async () => {
    const log = logSpy()
    const robotsBody = [
      '# llms.txt: https://example.com/llms.txt',
      'User-agent: GPTBot',
      'Disallow: /',
      'User-agent: *',
      'Allow: /',
    ].join('\n')
    const llmsBody = '# Example\n\n## Section\n\n- [page](https://example.com/p): note\n'
    const agentsTxtBody = 'Protocols: x402\nMCP: https://example.com/mcp\n'
    const agentsJsonBody = JSON.stringify({
      version: '0.5',
      standard: 'https://agentstxt.dev',
      site: { name: 'Example', url: 'https://example.com' },
      payments: { x402: {} },
    })
    const sitemapBody =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url></urlset>'
    installFetch({
      'https://example.com/robots.txt':  { status: 200, body: robotsBody },
      'https://example.com/llms.txt':    { status: 200, body: llmsBody },
      'https://example.com/agents.txt':  { status: 200, body: agentsTxtBody },
      'https://example.com/agents.json': { status: 200, body: agentsJsonBody },
      'https://example.com/sitemap.xml': { status: 200, body: sitemapBody },
    })
    await checkCompliance('https://example.com')
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toMatch(/Fully compliant/)
    expect(printed).toMatch(/Score: 5\/5/)
  })
})

describe('checkCompliance — partial compliance', () => {
  it('reports robots.txt as fail when not found and agents.* as warn (optional but recommended)', async () => {
    const log = logSpy()
    installFetch({})
    await checkCompliance('https://example.com')
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toMatch(/❌.*robots\.txt/)
    expect(printed).toMatch(/⚠️.*agents\.txt/)
    expect(printed).toMatch(/⚠️.*agents\.json/)
  })

  it('treats a network failure on a file as a fetch failure (status 0)', async () => {
    const log = logSpy()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'))
    await checkCompliance('https://example.com')
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toMatch(/Score: 0\/5/)
  })

  it('reports a 404 on agents.txt as "Not found (optional but recommended)"', async () => {
    const log = logSpy()
    installFetch({
      'https://example.com/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /\n' },
    })
    await checkCompliance('https://example.com')
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toMatch(/agents\.txt.*Not found \(optional but recommended\)/)
  })
})
