/**
 * MPP — Machine Payments Protocol via mppx (npm install mppx).
 *
 * The mppx server API is fetch-native: `mppx.<method>.charge(opts)(request)`
 * returns `{ status, challenge?, withReceipt? }`. We use it from a single
 * shared payment gate (see payment-gate.ts) — never as Express middleware,
 * which doesn't match the signature.
 *
 * Spec: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
 * SDK : https://mpp.dev/sdk/typescript
 */

import type { MppConfig, PricingConfig } from '@herald/core'
import { toAtomic } from './x402.js'

// Default USDC.e contract on Tempo mainnet.
const TEMPO_USDC_E = '0x20c0000000000000000000000000000000000000'

// ─────────────────────────────────────────────────────────────────────────────
// mppx instance type — minimal surface so this file compiles without mppx
// installed. Real types come at runtime.
// ─────────────────────────────────────────────────────────────────────────────

interface MethodFnResponse {
  status: number
  challenge?: Response
  withReceipt?: (response?: Response) => Response
}

type IntentFn = (opts: Record<string, unknown>) => (input: Request) => Promise<MethodFnResponse>

export interface MppxInstance {
  tempo?: { charge: IntentFn }
  stripe?: { charge: IntentFn }
  /** Methods registered at construction. */
  hasTempo: boolean
  hasStripe: boolean
}

interface MppxModule {
  Mppx: { create: (cfg: { methods: unknown[]; secretKey?: string; realm?: string }) => Record<string, unknown> & {
    tempo?: { charge: IntentFn }
    stripe?: { charge: IntentFn }
  } }
  tempo: ((opts: { currency?: string; recipient: string; testnet?: boolean }) => readonly unknown[]) & {
    charge: (opts: { currency?: string; recipient: string; testnet?: boolean }) => unknown
  }
  stripe: ((opts: { client: unknown; networkId: string; paymentMethodTypes?: string[] }) => readonly unknown[]) & {
    charge: (opts: { client: unknown; networkId: string; paymentMethodTypes?: string[] }) => unknown
  }
  /** Mppx.compose(...handlers)(request) — multi-method 402 in a single response. */
  compose: (...handlers: unknown[]) => (input: Request) => Promise<MethodFnResponse>
}

let modulePromise: Promise<MppxModule | null> | null = null

async function loadMppx(): Promise<MppxModule | null> {
  if (modulePromise) return modulePromise
  modulePromise = (async () => {
    try {
      return (await import('mppx/server')) as unknown as MppxModule
    } catch {
      console.warn(
        '[herald/web] MPP enabled but `mppx` package not installed — `npm install mppx`. MPP path disabled.',
      )
      return null
    }
  })()
  return modulePromise
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the mppx instance + intent factories from MppConfig.
// ─────────────────────────────────────────────────────────────────────────────

export interface MppxChargeOptions {
  /** Tempo amount in atomic units (e.g. micro-USDC for USDC.e on Tempo). */
  tempoAmount: string
  /** Stripe amount in currency-minor units (e.g. cents for USD). */
  stripeAmount: string
  description?: string
}

export interface MppxRuntime {
  /** Compose(tempo, stripe)(request) — a fetch-style handler that returns 402 or settles. */
  charge: (request: Request, options: MppxChargeOptions) => Promise<MethodFnResponse>
  /** True if at least one payment method (tempo or stripe) was registered. */
  ready: boolean
}

export async function createMppxRuntime(
  mppConfig: MppConfig,
  realm: string,
): Promise<MppxRuntime> {
  const mod = await loadMppx()
  if (!mod) return { charge: async () => ({ status: 0 }), ready: false }

  const methods: unknown[] = []
  const tempoEnabled = mppConfig.tempoEnabled !== false && !!mppConfig.tempoRecipient
  const stripeEnabled =
    mppConfig.stripeEnabled !== false &&
    !!mppConfig.stripeSecretKey &&
    !!mppConfig.stripeNetworkId

  if (tempoEnabled) {
    methods.push(
      mod.tempo.charge({
        currency: mppConfig.tempoCurrency ?? TEMPO_USDC_E,
        recipient: mppConfig.tempoRecipient!,
        testnet: mppConfig.tempoTestnet ?? false,
      }),
    )
  }

  let stripeClient: unknown = null
  if (stripeEnabled) {
    try {
      const { default: Stripe } = await import('stripe')
      stripeClient = new Stripe(mppConfig.stripeSecretKey!)
      methods.push(
        mod.stripe.charge({
          client: stripeClient,
          networkId: mppConfig.stripeNetworkId!,
          paymentMethodTypes: mppConfig.stripePaymentMethodTypes ?? ['card', 'link'],
        }),
      )
    } catch {
      console.warn(
        '[herald/web] Stripe MPP skipped — `stripe` package not installed. Run `npm install stripe`.',
      )
    }
  }

  if (methods.length === 0) {
    return { charge: async () => ({ status: 0 }), ready: false }
  }

  const mppx = mod.Mppx.create({
    methods,
    realm,
    ...(mppConfig.secretKey ? { secretKey: mppConfig.secretKey } : {}),
  })
  const tempoCharge = mppx.tempo?.charge
  const stripeCharge = mppx.stripe?.charge
  const tempoRecipient = mppConfig.tempoRecipient
  const stripeCurrency = mppConfig.stripeCurrency ?? 'usd'
  const description = mppConfig.description

  return {
    ready: true,
    charge: async (request, opts) => {
      const desc = opts.description ?? description
      const handlers: unknown[] = []
      if (tempoCharge && tempoRecipient) {
        handlers.push(
          tempoCharge({
            amount: opts.tempoAmount,
            recipient: tempoRecipient,
            ...(desc ? { description: desc } : {}),
          }),
        )
      }
      if (stripeCharge) {
        handlers.push(
          stripeCharge({
            amount: opts.stripeAmount,
            currency: stripeCurrency,
            ...(desc ? { description: desc } : {}),
          }),
        )
      }
      if (handlers.length === 1) {
        return (handlers[0] as (input: Request) => Promise<MethodFnResponse>)(request)
      }
      return mod.compose(...handlers)(request)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Pick the per-route MPP charge amount. Always atomic units (Tempo) — Stripe uses `decimals: 2`. */
export function pickMppPricing(
  mppConfig: MppConfig,
  pathname: string,
  prefix: string,
): { tempoAmount: string; stripeAmount: string; description?: string } {
  const perPath = mppConfig.perPath ?? {}
  const matchKey = Object.keys(perPath).find(
    (k) => pathname === `${prefix}${k}` || pathname.startsWith(`${prefix}${k}/`),
  )
  const pricing: PricingConfig = (matchKey ? perPath[matchKey] : mppConfig.pricing) ?? {
    amount: '1',
    token: 'USD',
  }
  const tempoDecimals = pricing.decimals ?? 6
  const tempoAmount = toAtomic(pricing.amount, tempoDecimals)
  const stripeAmount = toAtomic(pricing.amount, 2)
  return {
    tempoAmount,
    stripeAmount,
    ...(mppConfig.description ? { description: mppConfig.description } : {}),
  }
}
