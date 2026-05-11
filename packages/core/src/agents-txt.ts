import type { AgenticConfig } from './types.js'
import { resolveActiveProtocols } from './payments.js'

// ─────────────────────────────────────────────────────────────────────────────
// agents.txt generator — Layer 4 agent capabilities declaration
//
// Each capability block (Payments, Authorization, …) is self-contained and
// separated by a blank line. Add new blocks here as new protocols are adopted.
// Details (wallet addresses, capability schemas, etc.) belong in the protocol's
// own response layer (402 body, /.well-known/agent-configuration, etc.) — never
// in this file.
//
// Standard: https://agentstxt.dev
// ─────────────────────────────────────────────────────────────────────────────

export function generateAgentsTxt(config: AgenticConfig): string {
  const { site, payments, authorization, mcp, skills } = config
  const baseUrl = site.url.replace(/\/$/, '')
  const lines: string[] = [
    '# agents.txt',
    '# Standard: https://agentstxt.dev',
    `# JSON: ${baseUrl}/agents.json`,
  ]

  // ── Payments block ─────────────────────────────────────────────────────────
  // Emitted only when at least one protocol is actually configured (x402 has a
  // treasury, MPP has tempo/stripe credentials). Presence of `Protocols:` IS
  // the payment-block signal per spec §3.1 — no `Payments: enabled` line.
  // `Payments: required` is an OPTIONAL site-level policy hint (§5.3),
  // symmetric with `Identity: required`.
  if (payments) {
    const active = resolveActiveProtocols(payments)
    if (active.length > 0) {
      lines.push('')
      lines.push(`Protocols: ${active.join(', ')}`)
      if (payments.required) {
        lines.push('Payments: required')
      }
    }
  }

  // ── Authorization block ────────────────────────────────────────────────────
  if (authorization?.enabled) {
    const protocols = authorization.protocols ?? ['agent-auth']
    lines.push('')
    lines.push(`Authorization: ${protocols.join(', ')}`)
    if (authorization.identityRequired) {
      lines.push('Identity: required')
    }
  }

  // ── MCP block ──────────────────────────────────────────────────────────────
  if (mcp) {
    const endpoints = Array.isArray(mcp.endpoints) ? mcp.endpoints : [mcp.endpoints]
    lines.push('')
    for (const e of endpoints) {
      lines.push(`MCP: ${typeof e === 'string' ? e : e.url}`)
    }
  }

  // ── Skills block ───────────────────────────────────────────────────────────
  if (skills) {
    const urls = Array.isArray(skills.urls) ? skills.urls : [skills.urls]
    lines.push('')
    for (const e of urls) {
      lines.push(`Skills: ${typeof e === 'string' ? e : e.url}`)
    }
  }

  return lines.join('\n') + '\n'
}
