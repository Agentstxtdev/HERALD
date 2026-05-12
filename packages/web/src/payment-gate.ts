/**
 * Shared payment gate — framework-neutral.
 *
 * `gateRequest(request, opts)` runs the full decision:
 *   1. Exempt user-agent → pass through
 *   2. `Authorization: Payment <…>` present + MPP configured → MPP verify path
 *      (mppx returns either a fresh 402 or a verified Response with Payment-Receipt header)
 *   3. `PAYMENT-SIGNATURE` header present + x402 configured → x402 facilitator settle
 *      (returns a verified passthrough with PAYMENT-RESPONSE header, or a 402 on failure)
 *   4. Otherwise → emit a single 402 carrying both x402 `accepts[]` and MPP
 *      `WWW-Authenticate` so the agent picks whichever protocol it supports
 *
 * Adapters call this from a fetch-style entry point and write back the result.
 */

import type { AgenticConfig, PricingConfig } from '@herald/core'
import {
  buildAccepts,
  buildPaymentRequired,
  decodePaymentSignature,
  encodePaymentResponse,
  isExemptAgent,
  matchAccepts,
  settleX402,
  validatePaymentPayload,
  type PaymentRequirements,
} from './x402.js'
import { createMppxRuntime, pickMppPricing, type MppxRuntime } from './mpp.js'

export type GateResult =
  | { kind: 'pass' }
  | { kind: 'respond'; response: Response }
  | { kind: 'pass-with-headers'; headers: Record<string, string> }

export interface GateOptions {
  config: AgenticConfig
  pathPrefix: string
}

interface ResolvedGate {
  enabled: boolean
  protocols: ReadonlyArray<'mpp' | 'x402'>
  exemptUserAgents: string[]
  hasMpp: boolean
  hasX402: boolean
  mppx: MppxRuntime
  config: AgenticConfig
  pathPrefix: string
}

const cache = new WeakMap<AgenticConfig, Promise<ResolvedGate>>()

function resolveGate(opts: GateOptions): Promise<ResolvedGate> {
  const cached = cache.get(opts.config)
  if (cached) return cached
  const built = (async () => {
    const payments = opts.config.payments
    const protocols = (payments?.protocols ?? ['mpp', 'x402']) as ReadonlyArray<'mpp' | 'x402'>
    const exemptUserAgents = (payments?.exemptUserAgents ?? []).map((u) => u.toLowerCase())
    // The gate is active iff at least one protocol has real credentials —
    // mirrors `resolveActiveProtocols(payments)` from @herald/core. No
    // master `enabled` flag: presence of usable credentials IS the signal.
    const hasX402 = !!payments && protocols.includes('x402') && !!payments.x402?.treasury && !!(payments.x402.treasury.evmAddress || payments.x402.treasury.solanaAddress)
    const wantsMpp = !!payments && protocols.includes('mpp') && !!payments.mpp && !!(payments.mpp.tempoRecipient || (payments.mpp.stripeSecretKey && payments.mpp.stripeNetworkId))
    const mppx = wantsMpp
      ? await createMppxRuntime(payments!.mpp!, payments!.mpp!.realm ?? opts.config.site.name)
      : ({ charge: async () => ({ status: 0 }), ready: false } as MppxRuntime)
    const enabled = hasX402 || mppx.ready
    return {
      enabled,
      protocols,
      exemptUserAgents,
      hasMpp: mppx.ready,
      hasX402,
      mppx,
      config: opts.config,
      pathPrefix: opts.pathPrefix,
    }
  })()
  cache.set(opts.config, built)
  return built
}

// Pick the per-route x402 pricing. Falls back to default.
function pickX402Pricing(
  perPath: Record<string, PricingConfig> | undefined,
  defaultPricing: PricingConfig | undefined,
  pathname: string,
  prefix: string,
): PricingConfig {
  if (perPath) {
    const matchKey = Object.keys(perPath).find(
      (k) => pathname === `${prefix}${k}` || pathname.startsWith(`${prefix}${k}/`),
    )
    if (matchKey) return perPath[matchKey]!
  }
  return defaultPricing ?? { amount: '0.001', token: 'USDC' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate
// ─────────────────────────────────────────────────────────────────────────────

export async function gateRequest(request: Request, opts: GateOptions): Promise<GateResult> {
  const gate = await resolveGate(opts)
  if (!gate.enabled) return { kind: 'pass' }

  // 1. Exempt user agent → pass through
  const ua = request.headers.get('user-agent') ?? ''
  if (gate.exemptUserAgents.length > 0 && isExemptAgent(ua, gate.exemptUserAgents)) {
    return { kind: 'pass' }
  }

  const url = new URL(request.url)
  const x402Cfg = gate.config.payments?.x402
  const mppCfg = gate.config.payments?.mpp
  const accepts: PaymentRequirements[] | null =
    gate.hasX402 && x402Cfg
      ? buildAccepts(x402Cfg, pickX402Pricing(x402Cfg.perPath, x402Cfg.pricing, url.pathname, gate.pathPrefix))
      : null

  // 2. MPP verify (Authorization: Payment …)
  const auth = request.headers.get('authorization')
  if (gate.hasMpp && mppCfg && auth?.toLowerCase().startsWith('payment ')) {
    const pricing = pickMppPricing(mppCfg, url.pathname, gate.pathPrefix)
    const result = await gate.mppx.charge(request, pricing)
    if (result.status === 402 && result.challenge) {
      return { kind: 'respond', response: result.challenge }
    }
    if (result.withReceipt) {
      // mppx writes Payment-Receipt onto whatever Response we hand it.
      const tagged = result.withReceipt(new Response(null, { status: 200 }))
      const receipt = tagged.headers.get('Payment-Receipt')
      return receipt
        ? { kind: 'pass-with-headers', headers: { 'Payment-Receipt': receipt } }
        : { kind: 'pass' }
    }
    // Fall through if mppx returned an unexpected shape.
  }

  // 3. x402 verify (PAYMENT-SIGNATURE header)
  if (gate.hasX402 && accepts) {
    const signature = request.headers.get('payment-signature') ?? request.headers.get('x-payment')
    if (signature) {
      const decoded = decodePaymentSignature(signature)
      if (!decoded) {
        return {
          kind: 'respond',
          response: jsonResponse(400, { error: 'Invalid PAYMENT-SIGNATURE encoding' }),
        }
      }
      const payload = validatePaymentPayload(decoded)
      if (!payload) {
        return {
          kind: 'respond',
          response: jsonResponse(400, { error: 'Malformed PaymentPayload — required fields missing or wrong type' }),
        }
      }
      const matched = matchAccepts(payload, accepts)
      if (!matched) {
        return {
          kind: 'respond',
          response: jsonResponse(400, {
            error: 'Unsupported network or amount in PAYMENT-SIGNATURE',
          }),
        }
      }
      const settle = await settleX402({
        paymentPayload: payload,
        paymentRequirements: matched,
        ...(x402Cfg?.facilitatorUrl ? { facilitatorUrl: x402Cfg.facilitatorUrl } : {}),
      })
      if (!settle.success) {
        return {
          kind: 'respond',
          response: jsonResponse(402, {
            x402Version: 2,
            error: settle.errorReason ?? 'Settlement failed',
            message: settle.errorMessage,
            accepts,
          }),
        }
      }
      return {
        kind: 'pass-with-headers',
        headers: { 'PAYMENT-RESPONSE': encodePaymentResponse(settle) },
      }
    }
  }

  // 4. No credential — emit a single 402 with both protocols
  if (!gate.hasMpp && !gate.hasX402) {
    return {
      kind: 'respond',
      response: jsonResponse(402, {
        error: 'Payment required (no payment protocols configured)',
        protocols: gate.protocols,
      }),
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let mppWww: string | null = null
  if (gate.hasMpp && mppCfg) {
    const pricing = pickMppPricing(mppCfg, url.pathname, gate.pathPrefix)
    const challenge = await gate.mppx.charge(request, pricing)
    if (challenge.status === 402 && challenge.challenge) {
      mppWww = challenge.challenge.headers.get('WWW-Authenticate')
      if (mppWww) headers['WWW-Authenticate'] = mppWww
    }
  }

  const body = (accepts
    ? {
        ...buildPaymentRequired({
          resourceUrl: url.toString(),
          ...(gate.config.site.description ? { description: gate.config.site.description } : {}),
          accepts,
        }),
      }
    : { error: 'Payment required', protocols: gate.protocols }) as Record<string, unknown>

  if (mppWww) body.mpp = { challenge: mppWww }

  return { kind: 'respond', response: new Response(JSON.stringify(body, null, 2), { status: 402, headers }) }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
