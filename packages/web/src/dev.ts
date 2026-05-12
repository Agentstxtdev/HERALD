// ─────────────────────────────────────────────────────────────────────────────
// Dev-mode shim — apply the §4.5 headers config to dev-server responses so
// localhost behaves like production for the agents.txt headers check.
//
// Vite / Astro / SvelteKit / Remix dev servers do not honour `public/_headers`
// (the file is a Cloudflare / Netlify deploy-time artefact). Vercel's `vercel
// dev` similarly does not apply `vercel.json#headers` to every request. The
// result: `audit_site http://localhost:…` reports §4.5 fails that the same
// site will not exhibit in production.
//
// This module loads the generated headers file from disk, parses it via the
// core parser, and exposes:
//
//   - `heraldHeadersVitePlugin()` — a Vite plugin for Vite-based dev servers
//   - `heraldHeadersConnect()`    — a Connect / Express middleware
//   - `loadDevHeaderRules()`      — the loader, for users wiring their own
//
// The shim is dev-only by construction: Vite's `configureServer` hook runs
// only during `vite dev`, never during build. The Connect middleware is for
// adopters running an Express dev server; production deployments use the
// platform's edge headers (Cloudflare `_headers`, `vercel.json`, etc.) and
// never see this code path.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  matchHeadersForPath,
  parseHeadersFile,
  parseVercelHeaders,
  type HeaderRule,
} from '@herald/core'

export interface HeraldHeadersDevOptions {
  /**
   * Path to a Cloudflare / Netlify `_headers` file. Resolved relative to the
   * project root. Default: `./public/_headers`.
   */
  headersFile?: string
  /**
   * Path to a `vercel.json` whose `headers[]` should be applied. Used when
   * `headersFile` is not present. Default: `./vercel.json`.
   */
  vercelJson?: string
  /** Project root for relative-path resolution. Default: `process.cwd()`. */
  cwd?: string
  /**
   * Suppress the "no headers file found" warning. Default: `false` (warn once
   * so users notice that they enabled the plugin without running `herald
   * generate --headers`).
   */
  silent?: boolean
}

/**
 * Load and parse the header rules from the first available source:
 *   1. `_headers` (Cloudflare / Netlify syntax)
 *   2. `vercel.json#headers`
 *
 * Returns an empty array when neither file exists. Reads happen once per call;
 * the Vite plugin re-reads on each request to pick up `herald generate`
 * regenerations without a dev-server restart.
 */
export function loadDevHeaderRules(opts: HeraldHeadersDevOptions = {}): HeaderRule[] {
  const cwd = opts.cwd ?? process.cwd()
  const headersPath = resolve(cwd, opts.headersFile ?? './public/_headers')
  if (existsSync(headersPath)) {
    try {
      return parseHeadersFile(readFileSync(headersPath, 'utf8'))
    } catch {
      return []
    }
  }
  const vercelPath = resolve(cwd, opts.vercelJson ?? './vercel.json')
  if (existsSync(vercelPath)) {
    try {
      return parseVercelHeaders(readFileSync(vercelPath, 'utf8'))
    } catch {
      return []
    }
  }
  return []
}

// Minimal duck-typed shapes so this module does not depend on `vite` or
// `connect` types at build time. Vite's Plugin interface is structural; both
// `name` and `configureServer` are duck-typed.

interface DevServerRequest {
  url?: string
}
interface DevServerResponse {
  setHeader: (name: string, value: string) => void
}
type DevMiddleware = (req: DevServerRequest, res: DevServerResponse, next: () => void) => void

export interface HeraldHeadersVitePlugin {
  name: string
  apply: 'serve'
  configureServer: (server: { middlewares: { use: (mw: DevMiddleware) => void } }) => void
}

function pathnameOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url, 'http://_').pathname
  } catch {
    return null
  }
}

function makeMiddleware(opts: HeraldHeadersDevOptions): DevMiddleware {
  let warned = false
  return (req, res, next) => {
    const pathname = pathnameOf(req.url)
    if (!pathname) return next()
    const rules = loadDevHeaderRules(opts)
    if (rules.length === 0) {
      if (!warned && !opts.silent) {
        warned = true
        console.warn(
          'herald: dev headers shim enabled but no `_headers` or `vercel.json` found. ' +
            'Run `herald generate --headers` to emit one, or pass `silent: true` to suppress this warning.',
        )
      }
      return next()
    }
    const headers = matchHeadersForPath(rules, pathname)
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value)
    }
    next()
  }
}

/**
 * Connect / Express middleware. Wire into a custom dev server:
 *
 *   app.use(heraldHeadersConnect())
 *
 * Reads `public/_headers` (or `vercel.json` as fallback) on every request so
 * regenerations show up without a server restart.
 */
export function heraldHeadersConnect(opts: HeraldHeadersDevOptions = {}): DevMiddleware {
  return makeMiddleware(opts)
}

/**
 * Vite plugin. Drop into `vite.config.ts` or `astro.config.mjs`:
 *
 *   import { heraldHeadersVitePlugin } from '@herald/addon/dev'
 *   export default defineConfig({
 *     vite: { plugins: [heraldHeadersVitePlugin()] },
 *   })
 *
 * The plugin is `apply: 'serve'` so it runs only during `vite dev`; build
 * output is untouched and the production host's edge serves the real headers.
 */
export function heraldHeadersVitePlugin(opts: HeraldHeadersDevOptions = {}): HeraldHeadersVitePlugin {
  const middleware = makeMiddleware(opts)
  return {
    name: 'herald:headers-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// ── Hono adapter ─────────────────────────────────────────────────────────────
//
// Hono middleware shape: `(c, next) => Promise<void> | void`, where `c` is a
// Context. We duck-type the surface we touch (`c.req.path`, `c.header(k, v)`)
// so the package does not depend on `hono` at build time.

interface HonoLikeContext {
  req: { path: string }
  header: (key: string, value: string) => void
}
type HonoLikeMiddleware = (c: HonoLikeContext, next: () => Promise<void>) => Promise<void>

/**
 * Hono middleware. Wire into a Hono dev server:
 *
 *   import { Hono } from 'hono'
 *   import { heraldHeadersHono } from '@herald/addon/dev'
 *   const app = new Hono()
 *   app.use('*', heraldHeadersHono())
 *
 * Like the Vite plugin, this re-reads the headers file on each request so
 * `herald generate --headers` regenerations show up live in dev.
 */
export function heraldHeadersHono(opts: HeraldHeadersDevOptions = {}): HonoLikeMiddleware {
  let warned = false
  return async (c, next) => {
    const rules = loadDevHeaderRules(opts)
    if (rules.length === 0) {
      if (!warned && !opts.silent) {
        warned = true
        console.warn(
          'herald: dev headers shim enabled but no `_headers` or `vercel.json` found. ' +
            'Run `herald generate --headers` to emit one, or pass `silent: true` to suppress this warning.',
        )
      }
      await next()
      return
    }
    const headers = matchHeadersForPath(rules, c.req.path)
    for (const [key, value] of Object.entries(headers)) {
      c.header(key, value)
    }
    await next()
  }
}
