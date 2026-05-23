// ─────────────────────────────────────────────────────────────────────────────
// x402 well-known discovery — /.well-known/x402
//
// JSON document mirroring the `payments.x402` block from agents.json. The
// x402 specification (https://x402.org) does not mandate this path; the file
// is published as a convenience for agent-readiness scanners that probe
// /.well-known/x402 as the conventional discovery surface.
//
// Honest-declarations rule: emits null when `payments.x402` is absent or has
// no configured chains. The agents.txt deployment's `payments` block remains
// the canonical declaration; this file is a derivative pointer.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig } from './types.js'
import { isX402Active } from './payments.js'

export interface X402DiscoveryResource {
  url: string
  description?: string
  chains: string[]
  facilitator?: string
}

export interface X402DiscoveryDoc {
  $comment: string
  protocol: 'x402'
  version: 'v2'
  specification: string
  resources: X402DiscoveryResource[]
  pricing?: { amount: string; token?: string }
  discovery: {
    agentsJson: string
    openapi?: string
  }
}

function siteOriginOf(config: AgenticConfig): string | null {
  try { return new URL(config.site.url).origin } catch { return null }
}

function chainsFor(config: AgenticConfig): string[] {
  const x = config.payments?.x402
  if (!x) return []
  const evm = x.treasury?.evmChains ?? []
  const solanaNetwork = x.treasury?.solanaAddress
    ? (x.treasury.solanaNetwork === 'devnet'
        ? 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
        : 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
    : null
  return [...evm, ...(solanaNetwork ? [solanaNetwork] : [])]
}

export function generateX402WellKnown(config: AgenticConfig): string | null {
  if (!config.payments?.x402) return null
  if (!isX402Active(config.payments)) return null
  const chains = chainsFor(config)
  if (chains.length === 0) return null
  const origin = siteOriginOf(config)
  if (!origin) return null

  // The site's payable routes that emit a 402. herald has no general
  // catalogue of payable resources, so we pull from `payments.openapi.paths`
  // when it's declared (matches the x402-typed offers); otherwise the
  // resources list is empty and the doc still serves as a chain advertisement.
  const resources: X402DiscoveryResource[] = []
  const paths = config.payments?.openapi?.paths ?? {}
  for (const [pathname, entry] of Object.entries(paths)) {
    const hasX402Offer = (entry.offers ?? []).some((o) => o.method === 'x402')
    if (!hasX402Offer) continue
    resources.push({
      url: `${origin}${pathname}`,
      ...(entry.description ? { description: entry.description } : {}),
      chains,
      facilitator: 'https://x402.org/facilitator',
    })
  }

  const doc: X402DiscoveryDoc = {
    $comment: 'Discovery surface for the x402 payment protocol on this deployment. Mirrors the payments.x402 block from /agents.json. The x402 specification (https://x402.org) does not mandate this well-known path; it is published here as a convenience for agent-readiness scanners that probe /.well-known/x402 as the conventional discovery surface.',
    protocol: 'x402',
    version: 'v2',
    specification: 'https://x402.org',
    resources,
    discovery: {
      agentsJson: `${origin}/agents.json`,
      ...(config.payments?.openapi ? { openapi: `${origin}/openapi.json` } : {}),
    },
  }
  if (config.payments?.x402?.pricing?.amount) {
    doc.pricing = {
      amount: config.payments.x402.pricing.amount,
      ...(config.payments.x402.pricing.token ? { token: config.payments.x402.pricing.token } : {}),
    }
  }

  return JSON.stringify(doc, null, 2) + '\n'
}
