import type { AgenticConfig } from './types.js'
import { resolveActiveProtocols } from './payments.js'

const SOLANA_CHAIN_IDS: Record<string, string> = {
  'mainnet-beta': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet':       'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'testnet':      'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
}

// ─────────────────────────────────────────────────────────────────────────────
// agents.json generator — structured companion to agents.txt
//
// agents.txt is the announcement layer: minimal, human-friendly plain text.
// agents.json is the full machine-readable catalog: same config, richer output.
//
// Key additions over agents.txt:
//   - site metadata (name, url, description)
//   - payments: pricing, accepted chains, MPP session budget and fiat flags
//   - authorization: discovery endpoint pointer (/.well-known/agent-configuration)
//   - mcp: transport type per endpoint (always "streamable-http" for HTTP)
//
// Security: same rules as agents.txt.
//   Never include wallet addresses, API keys, JWKs, or any credentials.
//   Per-path pricing and treasury details belong in 402 responses only.
//
// Standard: https://agentstxt.dev
// ─────────────────────────────────────────────────────────────────────────────

export function generateAgentsJson(config: AgenticConfig): string {
  const { site, payments, authorization, mcp, skills } = config

  const obj: Record<string, unknown> = {
    version: '1.0',
    standard: 'https://agentstxt.dev',
    site: {
      name: site.name,
      url: site.url,
      ...(site.description !== undefined ? { description: site.description } : {}),
    },
  }

  // ── Payments ───────────────────────────────────────────────────────────────
  // Only emitted when `payments.enabled` AND at least one protocol is actually
  // configured. Avoids declaring capabilities the site can't fulfil.
  if (payments?.enabled) {
    const active = resolveActiveProtocols(payments)
    if (active.length > 0) {
      const p: Record<string, unknown> = {
        enabled: true,
        protocols: active,
      }

      // Pricing — safe to expose; agents use this to pre-screen affordability.
      // Wallet addresses are deliberately excluded (stay in 402 responses).
      const defaultPricing = payments.x402?.pricing ?? payments.mpp?.pricing
      if (defaultPricing) {
        p.pricing = {
          amount: defaultPricing.amount,
          ...(defaultPricing.token !== undefined ? { currency: defaultPricing.token } : {}),
        }
      }

      // x402: accepted chains (CAIP-2 IDs). Only emitted when x402 is active.
      if (active.includes('x402') && payments.x402) {
        const chains: string[] = payments.x402.treasury.evmChains ?? ['eip155:8453']
        if (payments.x402.treasury.solanaAddress) {
          const network = payments.x402.treasury.solanaNetwork ?? 'mainnet-beta'
          chains.push(SOLANA_CHAIN_IDS[network] ?? `solana:${network}`)
        }
        p.x402 = { chains }
      }

      obj.payments = p
    }
  }

  // ── Authorization ──────────────────────────────────────────────────────────
  if (authorization?.enabled) {
    const auth: Record<string, unknown> = {
      protocols: authorization.protocols ?? ['agent-auth'],
      // Always point to the well-known discovery endpoint — agents shouldn't
      // need to know this path from the spec.
      discovery: '/.well-known/agent-configuration',
    }
    if (authorization.identityRequired) auth.identity = 'required'
    obj.authorization = auth
  }

  // ── MCP ────────────────────────────────────────────────────────────────────
  if (mcp) {
    const endpoints = Array.isArray(mcp.endpoints) ? mcp.endpoints : [mcp.endpoints]
    // `type` defaults to "streamable-http" — the only HTTP-transport variant in
    // the MCP spec at time of writing (2025-03-26+). When MCP introduces new
    // HTTP transports, sites can pin a specific revision via `mcp[].version`
    // so agents can pre-check compatibility before opening a session.
    obj.mcp = endpoints.map((e) => {
      const url = typeof e === 'string' ? e : e.url
      const description = typeof e === 'string' ? undefined : e.description
      const version = typeof e === 'string' ? undefined : e.version
      return {
        url,
        type: 'streamable-http',
        ...(version && { version }),
        ...(description && { description }),
      }
    })
  }

  // ── Skills ─────────────────────────────────────────────────────────────────
  if (skills) {
    const urls = Array.isArray(skills.urls) ? skills.urls : [skills.urls]
    obj.skills = urls.map((e) => {
      const url = typeof e === 'string' ? e : e.url
      const description = typeof e === 'string' ? undefined : e.description
      return { url, ...(description && { description }) }
    })
  }

  return JSON.stringify(obj, null, 2) + '\n'
}
