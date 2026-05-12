import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  heraldHeadersConnect,
  heraldHeadersHono,
  heraldHeadersVitePlugin,
  loadDevHeaderRules,
} from '../dev.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'herald-dev-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function writeHeaders(content: string) {
  mkdirSync(join(cwd, 'public'), { recursive: true })
  writeFileSync(join(cwd, 'public', '_headers'), content)
}

function writeVercelJson(obj: unknown) {
  writeFileSync(join(cwd, 'vercel.json'), JSON.stringify(obj))
}

describe('loadDevHeaderRules', () => {
  it('reads `_headers` when present', () => {
    writeHeaders('/agents.txt\n  Content-Type: text/plain\n')
    const rules = loadDevHeaderRules({ cwd })
    expect(rules).toHaveLength(1)
    expect(rules[0]!.source).toBe('/agents.txt')
  })

  it('falls back to vercel.json when `_headers` is absent', () => {
    writeVercelJson({
      headers: [{ source: '/agents.json', headers: [{ key: 'Content-Type', value: 'application/json' }] }],
    })
    const rules = loadDevHeaderRules({ cwd })
    expect(rules).toHaveLength(1)
    expect(rules[0]!.source).toBe('/agents.json')
  })

  it('prefers `_headers` over vercel.json when both exist', () => {
    writeHeaders('/from-headers\n  X: y\n')
    writeVercelJson({ headers: [{ source: '/from-vercel', headers: [{ key: 'X', value: 'y' }] }] })
    expect(loadDevHeaderRules({ cwd })[0]!.source).toBe('/from-headers')
  })

  it('returns [] when neither file exists', () => {
    expect(loadDevHeaderRules({ cwd })).toEqual([])
  })
})

describe('heraldHeadersConnect', () => {
  it('sets matching headers on the response and calls next()', () => {
    writeHeaders(
      '/agents.txt\n  Content-Type: text/plain; charset=utf-8\n  Access-Control-Allow-Origin: *\n',
    )
    const mw = heraldHeadersConnect({ cwd, silent: true })
    const set: Record<string, string> = {}
    const next = vi.fn()
    mw(
      { url: '/agents.txt' },
      { setHeader: (k, v) => { set[k] = v } },
      next,
    )
    expect(set).toEqual({
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*',
    })
    expect(next).toHaveBeenCalledOnce()
  })

  it('sets nothing for non-matching paths but still calls next()', () => {
    writeHeaders('/agents.txt\n  Content-Type: text/plain\n')
    const mw = heraldHeadersConnect({ cwd, silent: true })
    const set: Record<string, string> = {}
    const next = vi.fn()
    mw({ url: '/other' }, { setHeader: (k, v) => { set[k] = v } }, next)
    expect(set).toEqual({})
    expect(next).toHaveBeenCalledOnce()
  })

  it('warns once when no headers file is found, unless silent', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = heraldHeadersConnect({ cwd })
    const next = vi.fn()
    mw({ url: '/x' }, { setHeader: () => {} }, next)
    mw({ url: '/y' }, { setHeader: () => {} }, next)
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('handles full URLs in req.url (Vite passes path-only, others pass full)', () => {
    writeHeaders('/agents.txt\n  X-A: 1\n')
    const mw = heraldHeadersConnect({ cwd, silent: true })
    const set: Record<string, string> = {}
    mw(
      { url: 'http://localhost:4321/agents.txt?cache=bust' },
      { setHeader: (k, v) => { set[k] = v } },
      () => {},
    )
    expect(set).toEqual({ 'x-a': '1' })
  })
})

describe('heraldHeadersHono', () => {
  it('sets matching headers via c.header() and calls next()', async () => {
    writeHeaders('/agents.json\n  Content-Type: application/json\n  Access-Control-Allow-Origin: *\n')
    const mw = heraldHeadersHono({ cwd, silent: true })
    const set: Record<string, string> = {}
    const next = vi.fn(async () => {})
    await mw(
      { req: { path: '/agents.json' }, header: (k, v) => { set[k] = v } },
      next,
    )
    expect(set).toEqual({
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    })
    expect(next).toHaveBeenCalledOnce()
  })

  it('no-ops on non-matching paths but still calls next()', async () => {
    writeHeaders('/agents.json\n  X: y\n')
    const mw = heraldHeadersHono({ cwd, silent: true })
    const set: Record<string, string> = {}
    const next = vi.fn(async () => {})
    await mw({ req: { path: '/other' }, header: (k, v) => { set[k] = v } }, next)
    expect(set).toEqual({})
    expect(next).toHaveBeenCalledOnce()
  })

  it('warns once when no headers file is found, unless silent', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mw = heraldHeadersHono({ cwd })
    const next = vi.fn(async () => {})
    await mw({ req: { path: '/x' }, header: () => {} }, next)
    await mw({ req: { path: '/y' }, header: () => {} }, next)
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})

describe('heraldHeadersVitePlugin', () => {
  it('returns a serve-only plugin that registers a middleware', () => {
    writeHeaders('/agents.txt\n  X: 1\n')
    const plugin = heraldHeadersVitePlugin({ cwd, silent: true })
    expect(plugin.name).toBe('herald:headers-dev')
    expect(plugin.apply).toBe('serve')
    const used: Array<(req: unknown, res: unknown, next: () => void) => void> = []
    plugin.configureServer({ middlewares: { use: (mw) => { used.push(mw as never) } } })
    expect(used).toHaveLength(1)
    const set: Record<string, string> = {}
    used[0]!(
      { url: '/agents.txt' },
      { setHeader: (k: string, v: string) => { set[k] = v } },
      () => {},
    )
    expect(set).toEqual({ x: '1' })
  })
})
