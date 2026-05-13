import type { AgenticConfig } from './types.js'

/**
 * Stable marker line emitted at the top of every herald-generated security.txt.
 * Consumers detect this prefix to decide "we generated this before" and to
 * avoid clobbering a hand-written file. Must remain on a line by itself.
 */
export const SECURITY_GENERATED_MARKER = '# Standard: https://www.rfc-editor.org/rfc/rfc9116'

const DAY_MS = 86_400_000

function isoDateOnlyZ(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

function defaultExpires(now: Date = new Date()): string {
  const future = new Date(now.getTime() + 365 * DAY_MS)
  future.setUTCHours(0, 0, 0, 0)
  return isoDateOnlyZ(future)
}

function isUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function normalizeContact(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (v.startsWith('mailto:') || v.startsWith('tel:') || v.startsWith('https://') || v.startsWith('http://')) {
    return v
  }
  if (v.includes('@') && !v.includes(' ')) return `mailto:${v}`
  return v
}

/**
 * Generate a security.txt body per RFC 9116. Returns null when the config
 * does not declare a `security` block (the file should not be emitted at
 * all for sites that do not opt in; the CLI gates writing on this return).
 */
export function generateSecurityTxt(config: AgenticConfig, now: Date = new Date()): string | null {
  const sec = config.security
  if (!sec || !sec.contact) return null

  const contacts = (Array.isArray(sec.contact) ? sec.contact : [sec.contact])
    .map(normalizeContact)
    .filter(Boolean)
  if (contacts.length === 0) return null

  const expires = sec.expires ?? defaultExpires(now)
  const lines: string[] = []
  lines.push(`# ${config.site.url}  RFC 9116 security.txt`)
  lines.push(SECURITY_GENERATED_MARKER)
  lines.push('')
  for (const c of contacts) lines.push(`Contact: ${c}`)
  lines.push(`Expires: ${expires}`)

  if (sec.preferredLanguages && sec.preferredLanguages.length > 0) {
    lines.push(`Preferred-Languages: ${sec.preferredLanguages.join(', ')}`)
  }

  const canonical = sec.canonical ?? new URL('/.well-known/security.txt', config.site.url).toString()
  lines.push(`Canonical: ${canonical}`)

  if (sec.policy && isUrl(sec.policy)) lines.push(`Policy: ${sec.policy}`)
  if (sec.acknowledgments && isUrl(sec.acknowledgments)) lines.push(`Acknowledgments: ${sec.acknowledgments}`)
  if (sec.hiring && isUrl(sec.hiring)) lines.push(`Hiring: ${sec.hiring}`)
  if (sec.encryption && isUrl(sec.encryption)) lines.push(`Encryption: ${sec.encryption}`)

  return lines.join('\n') + '\n'
}

/**
 * Lightweight validator. Mirrors the validate.ts shape used elsewhere.
 * Returns an array of issue strings; empty array = valid.
 */
export function validateSecurityTxt(body: string): string[] {
  const issues: string[] = []
  const lines = body.split('\n')
  let contactCount = 0
  let expiresLine: string | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const field = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (field === 'Contact') contactCount++
    if (field === 'Expires') expiresLine = value
  }
  if (contactCount === 0) issues.push('security.txt is missing a Contact field (RFC 9116 §2.5.4 — required)')
  if (!expiresLine) {
    issues.push('security.txt is missing an Expires field (RFC 9116 §2.5.5 — required)')
  } else {
    const expiresAt = Date.parse(expiresLine)
    if (Number.isNaN(expiresAt)) issues.push(`security.txt Expires value is not a valid ISO 8601 date: "${expiresLine}"`)
    else if (expiresAt < Date.now()) issues.push(`security.txt has expired (Expires: ${expiresLine})`)
  }
  return issues
}
