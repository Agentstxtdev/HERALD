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
  // Per-protocol blocks (`x402`, `mpp`, ...) are each emitted only when the
  // protocol is actually wired up. The presence of any per-protocol key IS the
  // support signal per spec §10.2; there is no top-level `protocols` array.
  // The corresponding `Protocols:` line in agents.txt carries the same set as
  // plain text for the announcement layer.
  if (payments) {
    const active = resolveActiveProtocols(payments)
    if (active.length > 0) {
      const p: Record<string, unknown> = {}

      // x402: accepted chains (CAIP-2 IDs) and an optional description of what
      // the agent is paying for. Only emitted when x402 is active.
      if (active.includes('x402') && payments.x402) {
        const chains: string[] = payments.x402.treasury.evmChains ?? ['eip155:8453']
        if (payments.x402.treasury.solanaAddress) {
          const network = payments.x402.treasury.solanaNetwork ?? 'mainnet-beta'
          chains.push(SOLANA_CHAIN_IDS[network] ?? `solana:${network}`)
        }
        p.x402 = {
          chains,
          ...(payments.x402.description ? { description: payments.x402.description } : {}),
        }
      }

      // mpp: configured method identifiers, plus an optional description of
      // what the agent is paying for. Only emitted when MPP is active. The
      // methods list mirrors the credentials actually wired up so an agent
      // without a Tempo wallet learns from this field that Stripe is available
      // without first hitting the 402 challenge.
      if (active.includes('mpp') && payments.mpp) {
        const methods: Array<'tempo' | 'stripe'> = []
        if (payments.mpp.tempoRecipient) methods.push('tempo')
        if (payments.mpp.stripeSecretKey && payments.mpp.stripeNetworkId) methods.push('stripe')
        if (methods.length > 0) {
          p.mpp = {
            methods,
            ...(payments.mpp.description ? { description: payments.mpp.description } : {}),
          }
        }
      }

      // Site-level policy. Symmetric with `authorization.identity`.
      if (payments.required) {
        p.required = true
      }

      // Pricing. Safe to expose; agents use this to pre-screen affordability.
      // Wallet addresses are deliberately excluded and stay in 402 responses.
      const defaultPricing = payments.x402?.pricing ?? payments.mpp?.pricing
      if (defaultPricing) {
        p.pricing = {
          amount: defaultPricing.amount,
          ...(defaultPricing.token !== undefined ? { currency: defaultPricing.token } : {}),
        }
      }

      // Only attach the payments block when at least one per-protocol key
      // exists. A configured-but-empty record would lie about capabilities.
      if (Object.keys(p).some((k) => k === 'x402' || k === 'mpp')) {
        obj.payments = p
      }
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
