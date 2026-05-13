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
//   - UCP profiles (config.ucp.profiles): same rule and same headers as A2A
//     AgentCards. The profile is governed by the UCP specification but the
//     CORS line is load-bearing for browser-context clients fetching the
//     profile cross-origin.
//
//   - `/llms.txt` and `/llms-full.txt`: emitted with `text/plain; charset=utf-8`
//     plus CORS and Cache-Control when the config has `content` (and `content.fullTxt`)
//     defined. Not governed by §4.5; the llmstxt.org spec does not mandate
//     headers. We emit them anyway because browser-context agents reading the
//     site documentation cross-origin need CORS, and the charset half is the
//     same UTF-8 invariant that drives the agents.txt entry.
//
//   - Skills paths (config.skills.urls): same-origin skill URLs collapse into
//     one `/<first-segment>/*` glob per unique segment, emitted with
//     `text/markdown; charset=utf-8`. The glob covers sibling files
//     (REFERENCE.md, asset files) so a SKILL.md declaration also CORSes the
//     companion docs the skill loader reads alongside it.
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

import type { AgenticConfig, A2AEntry, SkillEntry, UcpEntry } from './types.js'

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

function textStaticEntry(path: string): VercelHeaderEntry {
  return {
    source: path,
    headers: [
      { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Cache-Control', value: 'public, max-age=3600' },
    ],
  }
}

function markdownStaticEntry(path: string): VercelHeaderEntry {
  return {
    source: path,
    headers: [
      { key: 'Content-Type', value: 'text/markdown; charset=utf-8' },
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
 * Same shape as `a2aPaths` but for UCP profile URLs declared in
 * `config.ucp.profiles`. Cross-origin profile URLs are skipped: those are
 * served from another deployment whose headers are not our responsibility.
 */
function ucpPaths(config: AgenticConfig): string[] {
  if (!config.ucp) return []
  const siteOrigin = (() => {
    try { return new URL(config.site.url).origin } catch { return null }
  })()
  if (!siteOrigin) return []

  const profiles = Array.isArray(config.ucp.profiles) ? config.ucp.profiles : [config.ucp.profiles]
  const seen = new Set<string>()
  const paths: string[] = []
  for (const entry of profiles) {
    const rawUrl = typeof entry === 'string' ? entry : (entry as UcpEntry).url
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
 * Return glob sources covering same-origin skill URLs declared in
 * `config.skills.urls`. Each unique first path segment becomes a single
 * `/<segment>/*` glob so sibling files (README, REFERENCE, asset files) get
 * the same CORS / charset treatment as the declared SKILL.md without
 * requiring an entry per file. Cross-origin skill URLs are skipped because
 * those are served from another deployment.
 *
 * Example: `https://site.dev/skills/adopt-agents-txt/SKILL.md` produces
 * the glob `/skills/*`. A second declared URL under `/skills/foo/SKILL.md`
 * collapses into the same glob.
 */
function skillsGlobs(config: AgenticConfig): string[] {
  if (!config.skills) return []
  const siteOrigin = (() => {
    try { return new URL(config.site.url).origin } catch { return null }
  })()
  if (!siteOrigin) return []

  const raw = config.skills.urls
  const entries = Array.isArray(raw) ? raw : [raw]
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of entries) {
    const rawUrl = typeof entry === 'string' ? entry : (entry as SkillEntry).url
    try {
      const u = new URL(rawUrl)
      if (u.origin !== siteOrigin) continue
      const segments = u.pathname.split('/').filter(Boolean)
      if (segments.length === 0) continue
      const glob = `/${segments[0]}/*`
      if (seen.has(glob)) continue
      seen.add(glob)
      out.push(glob)
    } catch {
      // skip malformed entries; the config validator handles user-facing errors
    }
  }
  return out
}

/**
 * Build the full list of header entries this config implies: the §4.5 base
 * (`/agents.txt`, `/agents.json`) plus one entry per same-origin well-known
 * artefact declared in the config.
 *
 * Currently emitted:
 *   - §4.5 base (`/agents.txt`, `/agents.json`) — always
 *   - A2A AgentCard paths (same-origin) — when `config.a2a` is set
 *   - UCP profile paths (same-origin) — when `config.ucp` is set
 *   - `/llms.txt` — when `config.content` is set
 *   - `/llms-full.txt` — when `config.content.fullTxt` is set (gated separately
 *     so the entry follows the same "honest declarations" rule as the rest of
 *     the generator: announce only what the config actively produces)
 *   - Skills globs (same-origin) — when `config.skills` is set
 *
 * llms files are not governed by §4.5, but the CORS header is load-bearing for
 * any browser-context client fetching them cross-origin. Skill manifests
 * (markdown) get the same treatment with `text/markdown; charset=utf-8`.
 */
function entriesForConfig(config: AgenticConfig | undefined): VercelHeaderEntry[] {
  const out = BASE_VERCEL_ENTRIES.map((e) => ({ source: e.source, headers: e.headers.map((h) => ({ ...h })) }))
  if (!config) return out
  for (const path of a2aPaths(config)) {
    out.push(jsonStaticEntry(path))
  }
  for (const path of ucpPaths(config)) {
    out.push(jsonStaticEntry(path))
  }
  if (config.content) {
    out.push(textStaticEntry('/llms.txt'))
    if (config.content.fullTxt) {
      out.push(textStaticEntry('/llms-full.txt'))
    }
  }
  for (const glob of skillsGlobs(config)) {
    out.push(markdownStaticEntry(glob))
  }
  // /.well-known/security.txt (RFC 9116). Honest-declarations rule: emit the
  // entry only when the config actually declares a security.contact, so we
  // never advertise a path the generator did not also write.
  if (config.security?.contact) {
    const contacts = Array.isArray(config.security.contact) ? config.security.contact : [config.security.contact]
    if (contacts.some((c) => c && c.trim().length > 0)) {
      out.push(textStaticEntry('/.well-known/security.txt'))
    }
  }

  // /.well-known/api-catalog (RFC 9727). The catalog is built from any
  // mcp/a2a/ucp blocks declared in the config; emit the static-asset entry
  // whenever at least one of those is present (mirrors the catalog generator's
  // own emission rule).
  if (config.mcp || config.a2a || config.ucp) {
    out.push({
      source: '/.well-known/api-catalog',
      headers: [
        { key: 'Content-Type', value: 'application/linkset+json' },
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Cache-Control', value: 'public, max-age=3600' },
      ],
    })
  }

  // /.well-known/mcp/server-card.json (SEP-2127). Emitted only when the
  // config carries an MCP server card definition. The card itself is
  // generated by generateMcpServerCard(); the headers entry is the matching
  // CORS contract.
  if (config.mcp?.serverCard) {
    out.push(jsonStaticEntry('/.well-known/mcp/server-card.json'))
  }

  // /.well-known/agent-skills/index.json (Cloudflare RFC v0.2.0). Same gate
  // as the index generator: emit when the config declares any skills.
  if (config.skills) {
    out.push(jsonStaticEntry('/.well-known/agent-skills/index.json'))
  }

  // /openapi.json (MPP / Payment Discovery draft). Gated on the same config
  // field the generator consumes so the headers and the file always agree.
  if (config.payments?.openapi?.paths && Object.keys(config.payments.openapi.paths).length > 0) {
    out.push(jsonStaticEntry('/openapi.json'))
  }

  // Link headers on `/` (RFC 8288 / RFC 9727 §3). Point machine clients at the
  // discovery surfaces this site exposes. The Link header set is built from the
  // same config blocks that drive the static entries above so a site never
  // advertises a relation pointing at a path it does not actually serve.
  const linkValues: string[] = []
  if (config.mcp || config.a2a || config.ucp) {
    linkValues.push('</.well-known/api-catalog>; rel="api-catalog"')
  }
  if (config.mcp?.serverCard) {
    linkValues.push('</.well-known/mcp/server-card.json>; rel="describedby"; type="application/json"')
  }
  if (config.skills) {
    linkValues.push('</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"')
  }
  if (config.payments?.openapi?.paths && Object.keys(config.payments.openapi.paths).length > 0) {
    linkValues.push('</openapi.json>; rel="service-desc"; type="application/json"')
  }
  // agents.txt / agents.json are always emitted, so they always belong here.
  linkValues.push('</agents.txt>; rel="describedby"; type="text/plain"')
  linkValues.push('</agents.json>; rel="describedby"; type="application/json"')
  if (config.content) {
    linkValues.push('</llms.txt>; rel="describedby"; type="text/plain"')
  }
  // Same-origin A2A AgentCard: surface as describedby so RFC 9727 clients can
  // discover the card without re-parsing the API catalog.
  for (const path of a2aPaths(config)) {
    linkValues.push(`<${path}>; rel="describedby"; type="application/json"`)
  }
  if (linkValues.length > 0) {
    out.push({
      source: '/',
      headers: linkValues.map((v) => ({ key: 'Link', value: v })),
    })
  }

  return out
}

// ── _headers (Cloudflare / Netlify) emitter ─────────────────────────────────

function formatHeadersFileBody(entries: VercelHeaderEntry[]): string {
  const header =
    '# https://agentstxt.dev  spec (§4.5) — Serving Requirements\n' +
    '# Generated by HERALD. https://github.com/agentstxtdev/herald.'
  const blocks = entries.map((entry) => {
    const body = entry.headers.map((h) => `  ${h.key}: ${h.value}`).join('\n')
    return `${entry.source}\n${body}`
  })
  return [header, ...blocks].join('\n\n') + '\n'
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

// ── Parser (inverse of the generator) ───────────────────────────────────────

/** A parsed header rule: a path pattern plus the headers to apply to it. */
export interface HeaderRule {
  source: string
  headers: Array<{ key: string; value: string }>
}

/**
 * Parse a Cloudflare / Netlify `_headers` file body into rules.
 *
 * Format recap: a non-indented line is a path pattern; subsequent indented
 * `Key: Value` lines belong to that path. Lines starting with `#` are
 * comments and ignored. Blank lines separate blocks.
 */
export function parseHeadersFile(content: string): HeaderRule[] {
  const rules: HeaderRule[] = []
  let current: HeaderRule | null = null
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line) {
      current = null
      continue
    }
    if (line.trimStart().startsWith('#')) continue
    const isIndented = /^\s/.test(rawLine)
    if (!isIndented) {
      current = { source: line.trim(), headers: [] }
      rules.push(current)
      continue
    }
    if (!current) continue
    const trimmed = line.trim()
    const colon = trimmed.indexOf(':')
    if (colon <= 0) continue
    const key = trimmed.slice(0, colon).trim()
    const value = trimmed.slice(colon + 1).trim()
    if (!key) continue
    current.headers.push({ key, value })
  }
  return rules.filter((r) => r.headers.length > 0)
}

/**
 * Parse a `vercel.json` value (already-parsed JSON or raw string) into rules.
 * Returns an empty array when the input is malformed or has no `headers` key.
 */
export function parseVercelHeaders(input: unknown): HeaderRule[] {
  let parsed: unknown = input
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input) } catch { return [] }
  }
  if (!parsed || typeof parsed !== 'object') return []
  const headers = (parsed as { headers?: unknown }).headers
  if (!Array.isArray(headers)) return []
  const out: HeaderRule[] = []
  for (const entry of headers) {
    if (!entry || typeof entry !== 'object') continue
    const source = (entry as { source?: unknown }).source
    const hs = (entry as { headers?: unknown }).headers
    if (typeof source !== 'string' || !Array.isArray(hs)) continue
    const headerPairs: Array<{ key: string; value: string }> = []
    for (const h of hs) {
      if (!h || typeof h !== 'object') continue
      const key = (h as { key?: unknown }).key
      const value = (h as { value?: unknown }).value
      if (typeof key === 'string' && typeof value === 'string') {
        headerPairs.push({ key, value })
      }
    }
    if (headerPairs.length > 0) out.push({ source, headers: headerPairs })
  }
  return out
}

/**
 * Test whether a `_headers`-style source pattern matches a request pathname.
 * Supports exact match and `*` as a wildcard (any characters including `/`).
 * The §4.5 paths herald emits (`/agents.txt`, `/agents.json`, well-known
 * AgentCard / UCP profile paths) are exact, but users may hand-edit globs.
 */
function matchesSource(source: string, pathname: string): boolean {
  if (source === pathname) return true
  if (!source.includes('*')) return false
  const escaped = source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(pathname)
}

/**
 * Resolve the effective headers for a request pathname. Later rules win on key
 * collision, matching Cloudflare's "last match wins" semantics. Header keys
 * are returned lowercased so adapters can write them directly to a response.
 */
export function matchHeadersForPath(rules: HeaderRule[], pathname: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rule of rules) {
    if (!matchesSource(rule.source, pathname)) continue
    for (const h of rule.headers) {
      out[h.key.toLowerCase()] = h.value
    }
  }
  return out
}

/** A short, human-readable explanation of where the file was written and why. */
export function headersDeploymentNote(platform: HostingPlatform): string {
  switch (platform) {
    case 'cloudflare':
      return 'Cloudflare Workers / Pages: `_headers` is read at deploy time from the assets root. No further wiring needed.'
    case 'netlify':
      return 'Netlify: `_headers` is read at deploy time from the publish root. No further wiring needed.'
    case 'vercel':
      return 'Vercel: `vercel.json#headers` is applied at the edge. Existing entries are preserved; only the herald-managed paths (§4.5 plus declared A2A AgentCards and UCP profiles) were touched.'
    case 'unknown':
      return (
        'Hosting platform not detected. Emitted `_headers` (Cloudflare / Netlify syntax) as a best-effort default. ' +
        'If you deploy elsewhere (nginx, Apache, Caddy, S3+CloudFront, etc.), translate the rules into your platform\'s mechanism. ' +
        'See README §4.5 deployment table.'
      )
  }
}
