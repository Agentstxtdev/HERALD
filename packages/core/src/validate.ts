import { FREE_AI_SCRAPERS } from './robots.js'
import type { AgenticConfig } from './types.js'
import {
  PAYMENT_PROTOCOLS,
  AUTH_PROTOCOLS,
  MPP_METHODS,
  isAcceptedPaymentIdentifier,
  isAcceptedAuthIdentifier,
  isExperimentalIdentifier,
} from './protocols.js'

// ─────────────────────────────────────────────────────────────────────────────
// Spec compliance validators — check generated output against the Agentic Web
// Standard. Each function is a pure string/object → result transform so it can
// be used in CLI, CI, library code, or tests without any I/O.
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  rule: string
  status: 'pass' | 'warn' | 'fail'
  message: string
}

// ─────────────────────────────────────────────────────────────────────────────
// robots.txt validator
//
// Pass config to enable config-aware checks (e.g. skip blocklist check when
// blockFreeAiScrapers is explicitly false). Without config, generic checks run.
// ─────────────────────────────────────────────────────────────────────────────

export function validateRobotsTxt(content: string, config?: AgenticConfig): ValidationResult[] {
  const results: ValidationResult[] = []

  const shouldCheckBlocklist = config?.crawlers?.blockFreeAiScrapers !== false

  if (shouldCheckBlocklist) {
    const missing = FREE_AI_SCRAPERS.filter((bot) => !content.includes(bot))
    if (missing.length === 0) {
      results.push({ rule: 'ai-blocklist', status: 'pass', message: 'All known AI scrapers are blocked' })
    } else if (missing.length < FREE_AI_SCRAPERS.length) {
      results.push({
        rule: 'ai-blocklist',
        status: 'warn',
        message: `Partial AI blocklist — missing: ${missing.join(', ')}`,
      })
    } else {
      results.push({ rule: 'ai-blocklist', status: 'warn', message: 'No known AI scraper blocklist detected' })
    }
  }

  const hasLlmsRef = content.includes('llms.txt') || content.includes('/llms')
  results.push({
    rule: 'llms-ref',
    status: hasLlmsRef ? 'pass' : 'warn',
    message: hasLlmsRef ? 'References llms.txt' : 'No reference to llms.txt found',
  })

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// llms.txt validator — checks the llmstxt.org specification
// ─────────────────────────────────────────────────────────────────────────────

export function validateLlmsTxt(content: string): ValidationResult[] {
  const results: ValidationResult[] = []

  const hasH1 = content.startsWith('#')
  results.push({
    rule: 'h1-title',
    status: hasH1 ? 'pass' : 'fail',
    message: hasH1 ? 'Has required H1 title' : 'Missing required H1 title (spec: first line must be # Site Name)',
  })

  const hasSections = content.includes('## ')
  results.push({
    rule: 'sections',
    status: hasSections ? 'pass' : 'warn',
    message: hasSections ? 'Has H2 content sections' : 'No H2 sections found',
  })

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// agents.txt validator — checks agents.txt standard format
// ─────────────────────────────────────────────────────────────────────────────

// ── agents.txt protocol identifiers are sourced from ./protocols.js, which is
// the single registry for `x402` / `mpp` / `agent-auth`. Experimental
// identifiers (`x-…`) pass acceptance per spec §3.1.

export function validateAgentsTxt(content: string): ValidationResult[] {
  const results: ValidationResult[] = []

  // ── Standard header ────────────────────────────────────────────────────────
  const hasHeader = content.includes('# agents.txt')
  results.push({
    rule: 'standard-header',
    status: hasHeader ? 'pass' : 'warn',
    message: hasHeader ? 'Has standard header comment' : 'Missing # agents.txt header comment',
  })

  // ── Payments block ─────────────────────────────────────────────────────────
  // Presence of `Protocols:` is the payment-block signal per spec §3.1.
  // `Payments: required` is the optional site-level policy directive.
  const protocolsMatch = content.match(/^Protocols:\s*(.+)$/m)

  if (protocolsMatch) {
    const protocols = (protocolsMatch[1] ?? '').split(',').map((p) => p.trim()).filter(Boolean)
    const accepted = protocols.filter(isAcceptedPaymentIdentifier)
    const unknown = protocols.filter((p) => !isAcceptedPaymentIdentifier(p))

    results.push(
      accepted.length === 0
        ? { rule: 'protocols-valid', status: 'fail', message: `No valid payment protocols. Must include at least one of: ${PAYMENT_PROTOCOLS.join(', ')} (or an x- prefixed experimental identifier)` }
        : { rule: 'protocols-valid', status: 'pass', message: `Valid payment protocols: ${accepted.join(', ')}` },
    )
    if (unknown.length > 0) {
      results.push({ rule: 'unknown-protocols', status: 'warn', message: `Unknown payment protocol names: ${unknown.join(', ')} (registered: ${PAYMENT_PROTOCOLS.join(', ')}; use \`x-\` prefix for experimental)` })
    }
  }

  // ── Authorization block ────────────────────────────────────────────────────
  const authMatch = content.match(/^Authorization:\s*(.+)$/m)

  if (authMatch) {
    const protocols = (authMatch[1] ?? '').split(',').map((p) => p.trim()).filter(Boolean)
    const accepted = protocols.filter(isAcceptedAuthIdentifier)
    const unknown = protocols.filter((p) => !isAcceptedAuthIdentifier(p))

    results.push(
      accepted.length === 0
        ? { rule: 'authorization-valid', status: 'fail', message: `No valid auth protocols. Must include at least one of: ${AUTH_PROTOCOLS.join(', ')} (or an x- prefixed experimental identifier)` }
        : { rule: 'authorization-valid', status: 'pass', message: `Valid auth protocols: ${accepted.join(', ')}` },
    )
    if (unknown.length > 0) {
      results.push({ rule: 'unknown-auth-protocols', status: 'warn', message: `Unknown auth protocol names: ${unknown.join(', ')} (registered: ${AUTH_PROTOCOLS.join(', ')}; use \`x-\` prefix for experimental)` })
    }
  }

  // ── Identity directive ─────────────────────────────────────────────────────
  const identityMatch = content.match(/^Identity:\s*(.+)$/m)

  if (identityMatch) {
    const value = (identityMatch[1] ?? '').trim()
    results.push(
      value === 'required'
        ? { rule: 'identity-valid', status: 'pass', message: 'Identity: required is correctly set' }
        : { rule: 'identity-valid', status: 'fail', message: `Identity: value must be 'required', got '${value}'` },
    )
  }

  // ── MCP block ──────────────────────────────────────────────────────────────
  const mcpMatches = [...content.matchAll(/^MCP:\s*(.+)$/gm)]

  for (const match of mcpMatches) {
    const url = (match[1] ?? '').trim()
    let isValid = false
    try { isValid = Boolean(new URL(url)) } catch { /* invalid */ }

    if (!isValid) {
      results.push({ rule: 'mcp-endpoint-valid', status: 'fail', message: `MCP: value is not a valid URL: '${url}'` })
    } else {
      results.push({ rule: 'mcp-endpoint-valid', status: 'pass', message: `Valid MCP endpoint: ${url}` })
      if (!url.startsWith('https://')) {
        results.push({ rule: 'mcp-https', status: 'warn', message: `MCP endpoint should use HTTPS (MCP spec security requirement): ${url}` })
      }
    }
  }

  // ── Skills block ───────────────────────────────────────────────────────────
  const skillsMatches = [...content.matchAll(/^Skills:\s*(.+)$/gm)]

  for (const match of skillsMatches) {
    const url = (match[1] ?? '').trim()
    let isValid = false
    try { isValid = Boolean(new URL(url)) } catch { /* invalid */ }

    if (!isValid) {
      results.push({ rule: 'skills-url-valid', status: 'fail', message: `Skills: value is not a valid URL: '${url}'` })
    } else {
      results.push({ rule: 'skills-url-valid', status: 'pass', message: `Valid Skills URL: ${url}` })
      if (!url.startsWith('https://')) {
        results.push({ rule: 'skills-https', status: 'warn', message: `Skills URL should use HTTPS: ${url}` })
      }
    }
  }

  // ── UCP block ──────────────────────────────────────────────────────────────
  const ucpMatches = [...content.matchAll(/^UCP:\s*(.+)$/gm)]

  for (const match of ucpMatches) {
    const url = (match[1] ?? '').trim()
    let isValid = false
    try { isValid = Boolean(new URL(url)) } catch { /* invalid */ }

    if (!isValid) {
      results.push({ rule: 'ucp-url-valid', status: 'fail', message: `UCP: value is not a valid URL: '${url}'` })
    } else {
      results.push({ rule: 'ucp-url-valid', status: 'pass', message: `Valid UCP profile URL: ${url}` })
      if (!url.startsWith('https://')) {
        results.push({ rule: 'ucp-https', status: 'warn', message: `UCP URL should use HTTPS: ${url}` })
      }
    }
  }

  // ── A2A block ──────────────────────────────────────────────────────────────
  const a2aMatches = [...content.matchAll(/^A2A:\s*(.+)$/gm)]

  for (const match of a2aMatches) {
    const url = (match[1] ?? '').trim()
    let isValid = false
    try { isValid = Boolean(new URL(url)) } catch { /* invalid */ }

    if (!isValid) {
      results.push({ rule: 'a2a-url-valid', status: 'fail', message: `A2A: value is not a valid URL: '${url}'` })
    } else {
      results.push({ rule: 'a2a-url-valid', status: 'pass', message: `Valid A2A AgentCard URL: ${url}` })
      if (!url.startsWith('https://')) {
        results.push({ rule: 'a2a-https', status: 'warn', message: `A2A URL should use HTTPS: ${url}` })
      }
    }
  }

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// sitemap.xml validator — sitemaps.org 0.9 protocol
// Spec: https://sitemaps.org/protocol.html
//
// String-level checks (no XML parser dependency, consistent with the rest of
// this file). Enforces every constraint from the protocol that can be checked
// without a full parse: root + namespace, max 50k URLs, max 50 MB uncompressed,
// all <loc> from same host, <loc> < 2048 chars, <url> requires <loc>,
// <changefreq> enum, <priority> range, <lastmod> W3C Datetime.
// ─────────────────────────────────────────────────────────────────────────────

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const SITEMAP_MAX_URLS = 50_000
const SITEMAP_MAX_BYTES = 50 * 1024 * 1024  // 50 MB
const SITEMAP_LOC_MAX_LEN = 2048
const CHANGEFREQ_VALUES = new Set(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'])
// W3C Datetime — matches dates and datetimes per https://www.w3.org/TR/NOTE-datetime
// e.g. 2026-05-08, 2026-05-08T12:34:56Z, 2026-05-08T12:34:56+02:00, 2026-05-08T12:34:56.789Z
const W3C_DATETIME_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/

export function validateSitemapXml(content: string): ValidationResult[] {
  const results: ValidationResult[] = []
  const trimmed = content.trim()

  // ── Root + namespace ──────────────────────────────────────────────────────
  const isUrlset = /<urlset[\s>]/.test(trimmed)
  const isIndex = /<sitemapindex[\s>]/.test(trimmed)
  if (!isUrlset && !isIndex) {
    results.push({
      rule: 'sitemap-root',
      status: 'fail',
      message: 'sitemap.xml must have a <urlset> or <sitemapindex> root element',
    })
    return results
  }
  results.push({
    rule: 'sitemap-root',
    status: 'pass',
    message: isIndex ? 'Has <sitemapindex> root' : 'Has <urlset> root',
  })

  const hasNs = trimmed.includes(SITEMAP_NS)
  results.push({
    rule: 'sitemap-namespace',
    status: hasNs ? 'pass' : 'fail',
    message: hasNs
      ? 'Declares sitemaps.org/schemas/sitemap/0.9 namespace'
      : `Missing required xmlns="${SITEMAP_NS}" on root element`,
  })

  // ── File size cap (50 MB uncompressed, per protocol) ──────────────────────
  const byteLength = new TextEncoder().encode(content).byteLength
  if (byteLength > SITEMAP_MAX_BYTES) {
    results.push({
      rule: 'sitemap-file-size',
      status: 'fail',
      message: `File is ${(byteLength / 1024 / 1024).toFixed(1)} MB; protocol max is 50 MB uncompressed — split into a sitemap index`,
    })
  } else {
    results.push({ rule: 'sitemap-file-size', status: 'pass', message: `File is ${(byteLength / 1024).toFixed(1)} KB (within 50 MB cap)` })
  }

  // ── <url> entries (urlset only): each must contain <loc> ──────────────────
  if (isUrlset) {
    const urlBlocks = [...trimmed.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1] ?? '')
    const missingLoc = urlBlocks.filter((block) => !/<loc>[\s\S]*?<\/loc>/.test(block)).length
    if (missingLoc > 0) {
      results.push({
        rule: 'sitemap-url-loc-required',
        status: 'fail',
        message: `${missingLoc} <url> element(s) missing required <loc> child`,
      })
    }
  }

  // ── <loc> harvest + url-count cap ─────────────────────────────────────────
  const locs = [...trimmed.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => (m[1] ?? '').trim())

  if (locs.length === 0) {
    results.push({
      rule: 'sitemap-urls',
      status: 'warn',
      message: isIndex
        ? '<sitemapindex> contains no <sitemap><loc> entries'
        : '<urlset> contains no <url><loc> entries',
    })
    return results
  }

  results.push({
    rule: 'sitemap-urls',
    status: 'pass',
    message: `Contains ${locs.length} ${isIndex ? 'sitemap reference' : 'URL'}${locs.length === 1 ? '' : 's'}`,
  })

  if (locs.length > SITEMAP_MAX_URLS) {
    results.push({
      rule: 'sitemap-url-count',
      status: 'fail',
      message: `${locs.length} entries exceeds protocol max of ${SITEMAP_MAX_URLS} — split into a sitemap index`,
    })
  }

  // ── <loc> validity, length, same-host ─────────────────────────────────────
  const invalid: string[] = []
  const tooLong: string[] = []
  const hosts = new Set<string>()
  for (const loc of locs) {
    if (loc.length > SITEMAP_LOC_MAX_LEN) tooLong.push(loc)
    try {
      const u = new URL(loc)
      hosts.add(u.host.toLowerCase())
    } catch {
      invalid.push(loc)
    }
  }

  if (invalid.length > 0) {
    results.push({
      rule: 'sitemap-loc-valid',
      status: 'fail',
      message: `${invalid.length} <loc> value(s) are not valid absolute URLs (first: '${invalid[0]}')`,
    })
  } else {
    results.push({ rule: 'sitemap-loc-valid', status: 'pass', message: 'All <loc> values are valid absolute URLs' })
  }

  if (tooLong.length > 0) {
    results.push({
      rule: 'sitemap-loc-length',
      status: 'warn',
      message: `${tooLong.length} <loc> value(s) exceed ${SITEMAP_LOC_MAX_LEN} characters (first length: ${tooLong[0]?.length ?? 0})`,
    })
  }

  if (hosts.size > 1) {
    results.push({
      rule: 'sitemap-same-host',
      status: 'warn',
      message: `<loc> values span ${hosts.size} hosts (${[...hosts].slice(0, 3).join(', ')}${hosts.size > 3 ? ', ...' : ''}); protocol requires a single host per sitemap`,
    })
  } else if (hosts.size === 1) {
    results.push({ rule: 'sitemap-same-host', status: 'pass', message: `All URLs share host: ${[...hosts][0]}` })
  }

  // ── Optional metadata fields (urlset only) ────────────────────────────────
  if (isUrlset) {
    const lastmods = [...trimmed.matchAll(/<lastmod>([\s\S]*?)<\/lastmod>/g)].map((m) => (m[1] ?? '').trim())
    const badLastmod = lastmods.filter((v) => !W3C_DATETIME_RE.test(v))
    if (badLastmod.length > 0) {
      results.push({
        rule: 'sitemap-lastmod-format',
        status: 'warn',
        message: `${badLastmod.length} <lastmod> value(s) not in W3C Datetime format (first: '${badLastmod[0]}')`,
      })
    }

    const changefreqs = [...trimmed.matchAll(/<changefreq>([\s\S]*?)<\/changefreq>/g)].map((m) => (m[1] ?? '').trim())
    const badChangefreq = changefreqs.filter((v) => !CHANGEFREQ_VALUES.has(v))
    if (badChangefreq.length > 0) {
      results.push({
        rule: 'sitemap-changefreq-valid',
        status: 'fail',
        message: `${badChangefreq.length} <changefreq> value(s) not in {${[...CHANGEFREQ_VALUES].join(', ')}} (first: '${badChangefreq[0]}')`,
      })
    }

    const priorities = [...trimmed.matchAll(/<priority>([\s\S]*?)<\/priority>/g)].map((m) => (m[1] ?? '').trim())
    const badPriority = priorities.filter((v) => {
      const n = Number(v)
      return !Number.isFinite(n) || n < 0 || n > 1
    })
    if (badPriority.length > 0) {
      results.push({
        rule: 'sitemap-priority-range',
        status: 'fail',
        message: `${badPriority.length} <priority> value(s) outside [0.0, 1.0] (first: '${badPriority[0]}')`,
      })
    }
  }

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// agents.json validator — checks the structured JSON companion format
// ─────────────────────────────────────────────────────────────────────────────

export function validateAgentsJson(content: string): ValidationResult[] {
  const results: ValidationResult[] = []

  // ── Parse ──────────────────────────────────────────────────────────────────
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    results.push({ rule: 'json-parseable', status: 'fail', message: 'agents.json is not valid JSON' })
    return results
  }
  results.push({ rule: 'json-parseable', status: 'pass', message: 'Valid JSON' })

  // ── Envelope ───────────────────────────────────────────────────────────────
  results.push(
    typeof parsed.version === 'string'
      ? { rule: 'json-version', status: 'pass', message: `Version: ${parsed.version}` }
      : { rule: 'json-version', status: 'warn', message: 'Missing version field' },
  )
  results.push(
    typeof parsed.standard === 'string'
      ? { rule: 'json-standard', status: 'pass', message: 'Standard field present' }
      : { rule: 'json-standard', status: 'warn', message: 'Missing standard field' },
  )
  // `$schema` is optional but recommended: it lets editors (VS Code, JetBrains)
  // give operators free autocomplete and inline validation when they hand-edit
  // the file. We don't fetch the referenced URL; presence + canonical-origin
  // check is enough at this layer.
  if (typeof parsed.$schema === 'string') {
    results.push({
      rule: 'json-schema-ref',
      status: 'pass',
      message: `Schema reference present: ${parsed.$schema}`,
    })
  } else if ('$schema' in parsed) {
    results.push({
      rule: 'json-schema-ref',
      status: 'warn',
      message: '"$schema" present but not a string — should be the URL of the JSON Schema describing this document',
    })
  } else {
    results.push({
      rule: 'json-schema-ref',
      status: 'warn',
      message: 'No "$schema" field — consider adding one (e.g. "https://agentstxt.dev/schema/agents-json/v1.0.json") so editors offer autocomplete and inline validation',
    })
  }

  // ── Payments ───────────────────────────────────────────────────────────────
  // Presence of at least one per-protocol object inside the payments block IS
  // the support signal per spec §10.2. There is no top-level `protocols`
  // array; the supported set is `keys(payments) intersect {x402, mpp, ...}`.
  if (parsed.payments !== undefined) {
    const p = parsed.payments as Record<string, unknown>
    if ('required' in p && typeof p.required !== 'boolean') {
      results.push({ rule: 'json-payments-required', status: 'fail', message: '"payments.required" must be a boolean when present' })
    }
    const protocolKeys = Object.keys(p).filter(
      (k) => (PAYMENT_PROTOCOLS as readonly string[]).includes(k) || isExperimentalIdentifier(k),
    )
    if (protocolKeys.length === 0) {
      results.push({ rule: 'json-payments-valid', status: 'fail', message: `payments block must include at least one per-protocol object (${PAYMENT_PROTOCOLS.join(' or ')}, or an x- prefixed experimental key)` })
    } else {
      results.push({ rule: 'json-payments-valid', status: 'pass', message: `Payment protocols: ${protocolKeys.join(', ')}` })
    }
    const mpp = p.mpp as Record<string, unknown> | undefined
    if (mpp && 'methods' in mpp) {
      const methods = mpp.methods
      if (!Array.isArray(methods) || methods.length === 0) {
        results.push({ rule: 'json-mpp-methods', status: 'fail', message: '"payments.mpp.methods" must be a non-empty array when present' })
      } else {
        const recognised = new Set<string>(MPP_METHODS)
        const unknown = (methods as unknown[]).filter((m) => typeof m !== 'string' || !recognised.has(m as string))
        if (unknown.length > 0) {
          results.push({ rule: 'json-mpp-methods-unknown', status: 'warn', message: `Unrecognised MPP methods: ${unknown.join(', ')} (recognised: ${MPP_METHODS.join(', ')})` })
        }
      }
    }
    const pricing = p.pricing as Record<string, unknown> | undefined
    if (pricing?.amount !== undefined && typeof pricing.amount === 'string') {
      if (!/^\d+(\.\d+)?$/.test(pricing.amount)) {
        results.push({ rule: 'json-pricing-amount', status: 'warn', message: `payments.pricing.amount should be a decimal string e.g. "0.001", got: "${pricing.amount}"` })
      }
    }
  }

  // ── MCP ────────────────────────────────────────────────────────────────────
  if (Array.isArray(parsed.mcp)) {
    for (const entry of parsed.mcp as Record<string, unknown>[]) {
      const url = entry.url as string | undefined
      if (!url) {
        results.push({ rule: 'json-mcp-url-valid', status: 'fail', message: 'MCP entry missing url field' })
        continue
      }
      let isValid = false
      try { isValid = Boolean(new URL(url)) } catch { /* invalid */ }
      if (!isValid) {
        results.push({ rule: 'json-mcp-url-valid', status: 'fail', message: `MCP url is not a valid URL: '${url}'` })
      } else {
        results.push({ rule: 'json-mcp-url-valid', status: 'pass', message: `Valid MCP url: ${url}` })
        if (!url.startsWith('https://')) {
          results.push({ rule: 'json-mcp-https', status: 'warn', message: `MCP url should use HTTPS: ${url}` })
        }
      }
    }
  }

  // ── Skills ─────────────────────────────────────────────────────────────────
  if (Array.isArray(parsed.skills)) {
    for (const entry of parsed.skills as Record<string, unknown>[]) {
      const url = entry.url as string | undefined
      if (!url) {
        results.push({ rule: 'json-skills-url-valid', status: 'fail', message: 'Skills entry missing url field' })
        continue
      }
      let isValid = false
      try { isValid = Boolean(new URL(url)) } catch { /* invalid */ }
      if (!isValid) {
        results.push({ rule: 'json-skills-url-valid', status: 'fail', message: `Skills url is not a valid URL: '${url}'` })
      } else {
        results.push({ rule: 'json-skills-url-valid', status: 'pass', message: `Valid Skills url: ${url}` })
        if (!url.startsWith('https://')) {
          results.push({ rule: 'json-skills-https', status: 'warn', message: `Skills url should use HTTPS: ${url}` })
        }
      }
    }
  }

  // ── UCP ────────────────────────────────────────────────────────────────────
  if (Array.isArray(parsed.ucp)) {
    for (const entry of parsed.ucp as Record<string, unknown>[]) {
      const url = entry.url as string | undefined
      if (!url) {
        results.push({ rule: 'json-ucp-url-valid', status: 'fail', message: 'UCP entry missing url field' })
        continue
      }
      let isValid = false
      try { isValid = Boolean(new URL(url)) } catch { /* invalid */ }
      if (!isValid) {
        results.push({ rule: 'json-ucp-url-valid', status: 'fail', message: `UCP url is not a valid URL: '${url}'` })
      } else {
        results.push({ rule: 'json-ucp-url-valid', status: 'pass', message: `Valid UCP url: ${url}` })
        if (!url.startsWith('https://')) {
          results.push({ rule: 'json-ucp-https', status: 'warn', message: `UCP url should use HTTPS: ${url}` })
        }
      }
    }
  }

  // ── A2A ────────────────────────────────────────────────────────────────────
  if (Array.isArray(parsed.a2a)) {
    for (const entry of parsed.a2a as Record<string, unknown>[]) {
      const url = entry.url as string | undefined
      if (!url) {
        results.push({ rule: 'json-a2a-url-valid', status: 'fail', message: 'A2A entry missing url field' })
        continue
      }
      let isValid = false
      try { isValid = Boolean(new URL(url)) } catch { /* invalid */ }
      if (!isValid) {
        results.push({ rule: 'json-a2a-url-valid', status: 'fail', message: `A2A url is not a valid URL: '${url}'` })
      } else {
        results.push({ rule: 'json-a2a-url-valid', status: 'pass', message: `Valid A2A url: ${url}` })
        if (!url.startsWith('https://')) {
          results.push({ rule: 'json-a2a-https', status: 'warn', message: `A2A url should use HTTPS: ${url}` })
        }
      }
    }
  }

  return results
}
