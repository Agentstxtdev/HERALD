// ─────────────────────────────────────────────────────────────────────────────
// Headers — generators for the §4.5 deployment-side response headers, plus
// optional per-block header entries for static well-known artefacts.
//
// agents.txt spec §4.5 mandates four response headers on /agents.txt and
// /agents.json: a Content-Type with charset (for agents.txt), an
// Access-Control-Allow-Origin: *, and a SHOULD-set Cache-Control. Static-asset
// pipelines on most hosting platforms do not set these by default, so adopters
// need to wire the headers in some platform-specific way.
//
// Additional well-known artefacts declared elsewhere in the config are folded
// into the same headers file when they are served as static files:
//
//   - A2A AgentCards (config.a2a.cards): if any of the declared AgentCard URLs
//     share an origin with `site.url`, the generator emits matching headers for
//     each path. The AgentCard is governed by the A2A spec, not by agents.txt
//     §4.5, but the CORS line is load-bearing for any browser-context A2A
//     client probing the well-known path cross-origin.
//
// The agent-auth `/.well-known/agent-configuration` endpoint is intentionally
// NOT auto-emitted. It is conventionally served by a worker/handler that sets
// response headers programmatically; a static `_headers` entry would not apply
// to a dynamic route. Implementers serving the agent-configuration document as
// a static file should add it to their headers config manually.
//
// This module emits the right config file for the platform the adopter is
// deploying to. The CLI calls `generateHeadersFile(platform, config?)` and
// writes the result to disk. See `headersDeploymentNote()` for the per-platform
// guidance the CLI can print after writing.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig, A2AEntry } from './types.js'

export type HostingPlatform = 'cloudflare' | 'netlify' | 'vercel' | 'unknown'

export interface HeadersFile {
  /** Filename relative to the project root (or `--out` directory for `_headers`-style files). */
  filename: string
  /** Whether the path is relative to `--out` (the public/static directory) or the project root. */
  pathRelativeTo: 'out' | 'project-root'
  /** File contents (full file, ready to write). */
  content: string
  /**
   * How the CLI should treat an existing file at the same path:
   *   - `overwrite`  : replace unconditionally (safe for `_headers`, which we own)
   *   - `merge-json` : parse existing JSON, merge our headers entries, write back
   */
  strategy: 'overwrite' | 'merge-json'
}

export interface VercelHeaderEntry {
  source: string
  headers: Array<{ key: string; value: string }>
}

// ── Base §4.5 entries ────────────────────────────────────────────────────────
//
// These two paths are required by spec §4.5 regardless of what else is
// configured.

const BASE_VERCEL_ENTRIES: VercelHeaderEntry[] = [
  {
    source: '/agents.txt',
    headers: [
      { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Cache-Control', value: 'public, max-age=3600' },
    ],
  },
  {
    source: '/agents.json',
    headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Cache-Control', value: 'public, max-age=3600' },
    ],
  },
]

function jsonStaticEntry(path: string): VercelHeaderEntry {
  return {
    source: path,
    headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Cache-Control', value: 'public, max-age=3600' },
    ],
  }
}

// ── Per-config extension entries ─────────────────────────────────────────────

/**
 * Return the AgentCard URL paths that share an origin with `site.url`. URLs on
 * a different origin are skipped: the user serves those from another deployment
 * and headers there are not our responsibility.
 */
function a2aPaths(config: AgenticConfig): string[] {
  if (!config.a2a) return []
  const siteOrigin = (() => {
    try { return new URL(config.site.url).origin } catch { return null }
  })()
  if (!siteOrigin) return []

  const cards = Array.isArray(config.a2a.cards) ? config.a2a.cards : [config.a2a.cards]
  const seen = new Set<string>()
  const paths: string[] = []
  for (const entry of cards) {
    const rawUrl = typeof entry === 'string' ? entry : (entry as A2AEntry).url
    try {
      const u = new URL(rawUrl)
      if (u.origin !== siteOrigin) continue
      if (seen.has(u.pathname)) continue
      seen.add(u.pathname)
      paths.push(u.pathname)
    } catch {
      // skip malformed entries; the config validator handles user-facing errors
    }
  }
  return paths
}

/**
 * Build the full list of header entries this config implies: the §4.5 base
 * (`/agents.txt`, `/agents.json`) plus one entry per same-origin A2A AgentCard
 * path. Used by both the `_headers` plain-text generator and the Vercel JSON
 * generator.
 */
function entriesForConfig(config: AgenticConfig | undefined): VercelHeaderEntry[] {
  const out = BASE_VERCEL_ENTRIES.map((e) => ({ source: e.source, headers: e.headers.map((h) => ({ ...h })) }))
  if (!config) return out
  for (const path of a2aPaths(config)) {
    out.push(jsonStaticEntry(path))
  }
  return out
}

// ── _headers (Cloudflare / Netlify) emitter ─────────────────────────────────

function formatHeadersFileBody(entries: VercelHeaderEntry[]): string {
  const header =
    '# agents.txt spec §4.5 — Serving Requirements\n' +
    '# https://agentstxt.dev  (§4.5)\n' +
    '# Generated by herald. Safe to hand-edit; `herald generate` regenerates.\n'
  const blocks = entries.map((entry) => {
    const body = entry.headers.map((h) => `  ${h.key}: ${h.value}`).join('\n')
    return `${entry.source}\n${body}`
  })
  return [header, ...blocks].join('\n') + '\n'
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the headers config file for the given platform. When `config` is
 * supplied, additional entries are emitted for any same-origin A2A AgentCard
 * paths declared in the config. The §4.5 base entries are always present.
 *
 * Output layout per platform:
 *   - cloudflare / netlify : `_headers` written into `--out` (the public dir)
 *   - vercel               : `vercel.json` written to the project root, merged
 *                            with any existing config (CLI handles the read+merge)
 *   - unknown              : `_headers` written into `--out` (best-effort default,
 *                            CLI prints a warning that the user must wire it up
 *                            on their host)
 */
export function generateHeadersFile(platform: HostingPlatform, config?: AgenticConfig): HeadersFile {
  const entries = entriesForConfig(config)
  switch (platform) {
    case 'cloudflare':
    case 'netlify':
    case 'unknown':
      return {
        filename: '_headers',
        pathRelativeTo: 'out',
        content: formatHeadersFileBody(entries),
        strategy: 'overwrite',
      }
    case 'vercel':
      return {
        filename: 'vercel.json',
        pathRelativeTo: 'project-root',
        content: JSON.stringify({ headers: entries }, null, 2) + '\n',
        strategy: 'merge-json',
      }
  }
}

/** Returns the entries that must be present in `vercel.json#headers` for this config. */
export function vercelHeaderEntries(config?: AgenticConfig): VercelHeaderEntry[] {
  return entriesForConfig(config)
}

/**
 * Merge our entries into an existing vercel.json `headers` array. Any existing
 * entries with a different `source` are preserved verbatim. Entries with a
 * colliding `source` (the §4.5 paths and any same-origin AgentCard paths) are
 * replaced so the herald-managed values win: we own those paths, the user
 * configures the rest. Returns the merged array.
 */
export function mergeVercelHeaders(existing: unknown, config?: AgenticConfig): VercelHeaderEntry[] {
  const ours = vercelHeaderEntries(config)
  const ourSources = new Set(ours.map((e) => e.source))
  const preserved = Array.isArray(existing)
    ? (existing as VercelHeaderEntry[]).filter(
        (e) => e && typeof e === 'object' && typeof e.source === 'string' && !ourSources.has(e.source),
      )
    : []
  return [...preserved, ...ours]
}

/** A short, human-readable explanation of where the file was written and why. */
export function headersDeploymentNote(platform: HostingPlatform): string {
  switch (platform) {
    case 'cloudflare':
      return 'Cloudflare Workers / Pages: `_headers` is read at deploy time from the assets root. No further wiring needed.'
    case 'netlify':
      return 'Netlify: `_headers` is read at deploy time from the publish root. No further wiring needed.'
    case 'vercel':
      return 'Vercel: `vercel.json#headers` is applied at the edge. Existing entries are preserved; only the herald-managed paths (§4.5 plus declared A2A AgentCards) were touched.'
    case 'unknown':
      return (
        'Hosting platform not detected. Emitted `_headers` (Cloudflare / Netlify syntax) as a best-effort default. ' +
        'If you deploy elsewhere (nginx, Apache, Caddy, S3+CloudFront, etc.), translate the rules into your platform\'s mechanism. ' +
        'See README §4.5 deployment table.'
      )
  }
}
