// ─────────────────────────────────────────────────────────────────────────────
// OpenAPI discovery generator — /openapi.json
//
// Emits a minimal OpenAPI 3.1 document declaring the site's payable paths with
// `x-payment-info` extensions per the MPP / Payment Discovery draft
// (https://paymentauth.org/draft-payment-discovery-00.txt). Agents read this
// file to pre-screen what an endpoint costs before issuing the request.
//
// Scope: declaration only. herald does not author the full OpenAPI schema for
// arbitrary site APIs — only the payable-paths slice the auditors look at. A
// site with a richer API should merge its own spec with this output (or hand-
// author the full document and skip this generator).
//
// Honest-declarations rule: emits null when `payments.openapi.paths` is empty
// or absent. Each path's offers[] is emitted verbatim.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig, OpenApiPaymentOffer } from './types.js'

function singleOrOffers(offers: OpenApiPaymentOffer[]): unknown {
  // Shorthand single-offer form per the discovery draft §3.2: when there is
  // exactly one offer, the x-payment-info value is the offer object itself.
  // Multiple offers go under an `offers[]` array.
  if (offers.length === 1) return offers[0]
  return { offers }
}

export function generateOpenApiJson(config: AgenticConfig): string | null {
  const oa = config.payments?.openapi
  if (!oa || !oa.paths || Object.keys(oa.paths).length === 0) return null

  const paths: Record<string, unknown> = {}
  for (const [pathname, entry] of Object.entries(oa.paths)) {
    if (!entry.offers || entry.offers.length === 0) {
      console.warn(`[herald] /openapi.json: skipping path "${pathname}" — no payment offers declared`)
      continue
    }
    // GET is the safe default for a discovery-only doc. Sites with non-GET
    // payable operations should hand-author their own OpenAPI; herald's
    // discovery slice deliberately stays minimal.
    paths[pathname] = {
      get: {
        ...(entry.summary ? { summary: entry.summary } : {}),
        ...(entry.description ? { description: entry.description } : {}),
        'x-payment-info': singleOrOffers(entry.offers),
        responses: {
          '200': { description: 'Payment verified; response returned.' },
          '402': { description: 'Payment required. Resolve the x-payment-info offer(s) and retry.' },
        },
      },
    }
  }

  if (Object.keys(paths).length === 0) return null

  const doc = {
    openapi: '3.1.0',
    info: {
      title:   oa.title   ?? `${config.site.name} — payable API`,
      version: oa.version ?? '1.0.0',
      ...(config.site.description ? { description: config.site.description } : {}),
    },
    servers: [{ url: config.site.url.replace(/\/$/, '') }],
    paths,
  }

  return JSON.stringify(doc, null, 2) + '\n'
}
