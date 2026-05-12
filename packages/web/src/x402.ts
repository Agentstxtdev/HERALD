/**
 * x402 v2 — direct protocol implementation, no SDK dependency.
 *
 * Wire format:
 *   Server → Client : 402 with `accepts: PaymentRequirements[]` (atomic units, CAIP-2 networks)
 *   Client → Server : `PAYMENT-SIGNATURE` header — base64(JSON.stringify(PaymentPayload))
 *   Server → Client : `PAYMENT-RESPONSE` header — base64(JSON.stringify(SettlementResponse))
 *
 * Verification + settlement are delegated to a public facilitator
 * (default: https://x402.org/facilitator) — we POST `/settle` with the
 * payment payload and the matched payment requirements.
 *
 * Spec: https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md
 * Migration v1→v2: https://docs.x402.org/guides/migration-v1-to-v2
 */

import type { X402Config, PricingConfig } from '@herald/core'

// ─────────────────────────────────────────────────────────────────────────────
// CAIP-2 network IDs (verified against x402-specification-v2)
// ─────────────────────────────────────────────────────────────────────────────

export const SOLANA_CAIP2 = {
  'mainnet-beta': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet':       'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
} as const

// Default USDC asset addresses per CAIP-2 network. Override via X402Config.assets.
const DEFAULT_USDC_ASSETS: Record<string, string> = {
  'eip155:8453':                                   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
  'eip155:84532':                                  '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
  'eip155:1':                                      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp':       'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1':       '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
}

const DEFAULT_FACILITATOR = 'https://x402.org/facilitator'
const DEFAULT_MAX_TIMEOUT = 60

// ─────────────────────────────────────────────────────────────────────────────
// PaymentRequirements — one entry of the 402 `accepts[]` array
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentRequirements {
  scheme: 'exact'
  network: string
  amount: string                       // atomic units, decimal string
  asset: string                        // token contract address or ISO 4217 code
  payTo: string
  maxTimeoutSeconds: number
  extra?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a major-unit decimal string to an atomic-unit decimal string. */
export function toAtomic(amount: string, decimals: number): string {
  const [whole = '0', frac = ''] = amount.split('.')
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const combined = `${whole}${padded}`.replace(/^0+/, '') || '0'
  return combined
}

export function isExemptAgent(userAgent: string, exemptList: string[]): boolean {
  const ua = userAgent.toLowerCase()
  return exemptList.some((e) => ua.includes(e.toLowerCase()))
}

function isSolanaNetwork(network: string): boolean {
  return network.startsWith('solana:')
}

function buildExtra(network: string, token: string | undefined): Record<string, unknown> {
  const name = token ?? 'USDC'
  // EIP-712 domain version is required for EVM USDC (`version: '2'`).
  // Solana doesn't use EIP-712 — only the token name is included.
  return isSolanaNetwork(network) ? { name } : { name, version: '2' }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildAccepts — turn an X402Config + pricing into accepts[]
// ─────────────────────────────────────────────────────────────────────────────

export function buildAccepts(x402: X402Config, pricing: PricingConfig): PaymentRequirements[] {
  const decimals = pricing.decimals ?? 6
  const amount = toAtomic(pricing.amount, decimals)
  const maxTimeoutSeconds = x402.maxTimeoutSeconds ?? DEFAULT_MAX_TIMEOUT
  const overrides = x402.assets ?? {}
  const out: PaymentRequirements[] = []

  if (x402.treasury.evmAddress) {
    const chains = x402.treasury.evmChains ?? ['eip155:8453']
    for (const network of chains) {
      const asset = overrides[network] ?? DEFAULT_USDC_ASSETS[network]
      if (!asset) {
        throw new Error(
          `x402: no default asset for network "${network}". ` +
          `Add it under x402.assets["${network}"] = "<contract>".`,
        )
      }
      out.push({
        scheme: 'exact',
        network,
        amount,
        asset,
        payTo: x402.treasury.evmAddress,
        maxTimeoutSeconds,
        extra: buildExtra(network, pricing.token),
      })
    }
  }

  if (x402.treasury.solanaAddress) {
    const solNet = x402.treasury.solanaNetwork ?? 'mainnet-beta'
    const network = SOLANA_CAIP2[solNet]
    if (!network) {
      throw new Error(
        `x402: unknown Solana network "${solNet}". ` +
        `Valid: ${Object.keys(SOLANA_CAIP2).join(', ')}`,
      )
    }
    const asset = overrides[network] ?? DEFAULT_USDC_ASSETS[network]
    if (!asset) {
      throw new Error(`x402: no default asset for Solana network "${network}".`)
    }
    out.push({
      scheme: 'exact',
      network,
      amount,
      asset,
      payTo: x402.treasury.solanaAddress,
      maxTimeoutSeconds,
      extra: buildExtra(network, pricing.token),
    })
  }

  if (out.length === 0) {
    throw new Error(
      'x402: no treasury address configured. Set x402.treasury.evmAddress and/or x402.treasury.solanaAddress.',
    )
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Header coding — base64 + JSON
// ─────────────────────────────────────────────────────────────────────────────

function encodeBase64(s: string): string {
  if (typeof btoa === 'function') return btoa(s)
  return Buffer.from(s, 'utf-8').toString('base64')
}

function decodeBase64(s: string): string {
  if (typeof atob === 'function') return atob(s)
  return Buffer.from(s, 'base64').toString('utf-8')
}

export function decodePaymentSignature(header: string | null | undefined): unknown | null {
  if (!header) return null
  try {
    return JSON.parse(decodeBase64(header))
  } catch {
    return null
  }
}

export function encodePaymentResponse(settlement: unknown): string {
  return encodeBase64(JSON.stringify(settlement))
}

// ─────────────────────────────────────────────────────────────────────────────
// Defense-in-depth: shape validation for PaymentPayload before facilitator hop
// (rejects obviously malformed input so we don't waste a /settle round-trip)
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidatedPaymentPayload {
  x402Version: number
  accepted: { scheme: string; network: string; amount: string; asset: string; payTo: string }
  payload: Record<string, unknown>
}

export function validatePaymentPayload(payload: unknown): ValidatedPaymentPayload | null {
  if (!isObject(payload)) return null
  if (payload.x402Version !== 2 && payload.x402Version !== 1) return null

  const accepted = payload.accepted
  if (!isObject(accepted)) return null
  if (typeof accepted.scheme !== 'string' || accepted.scheme.length === 0) return null
  if (typeof accepted.network !== 'string' || accepted.network.length === 0) return null
  if (typeof accepted.amount !== 'string' || !/^\d+$/.test(accepted.amount)) return null
  if (typeof accepted.asset !== 'string' || accepted.asset.length === 0) return null
  if (typeof accepted.payTo !== 'string' || accepted.payTo.length === 0) return null

  if (!isObject(payload.payload)) return null

  return {
    x402Version: payload.x402Version,
    accepted: {
      scheme: accepted.scheme,
      network: accepted.network,
      amount: accepted.amount,
      asset: accepted.asset,
      payTo: accepted.payTo,
    },
    payload: payload.payload,
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ─────────────────────────────────────────────────────────────────────────────
// 402 challenge body
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentRequiredBody {
  x402Version: 2
  error?: string
  resource: { url: string; description?: string; mimeType?: string }
  accepts: PaymentRequirements[]
  extensions?: Record<string, unknown>
}

export function buildPaymentRequired(params: {
  resourceUrl: string
  description?: string
  accepts: PaymentRequirements[]
  error?: string
}): PaymentRequiredBody {
  return {
    x402Version: 2,
    error: params.error ?? 'Payment required (PAYMENT-SIGNATURE header missing)',
    resource: {
      url: params.resourceUrl,
      ...(params.description ? { description: params.description } : {}),
      mimeType: 'application/json',
    },
    accepts: params.accepts,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Facilitator settle — verify + settle in one round-trip
// ─────────────────────────────────────────────────────────────────────────────

export interface SettlementResponse {
  success: boolean
  errorReason?: string
  errorMessage?: string
  payer?: string
  transaction: string
  network: string
  amount?: string
}

export async function settleX402(params: {
  paymentPayload: unknown
  paymentRequirements: PaymentRequirements
  facilitatorUrl?: string
}): Promise<SettlementResponse> {
  const url = `${params.facilitatorUrl ?? DEFAULT_FACILITATOR}/settle`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: 2,
      paymentPayload: params.paymentPayload,
      paymentRequirements: params.paymentRequirements,
    }),
  })
  return (await res.json()) as SettlementResponse
}

/**
 * Match a decoded PAYMENT-SIGNATURE payload against our `accepts[]`.
 * Returns the matched requirement, or null if the payload's `accepted` block
 * doesn't correspond to any advertised option.
 */
export function matchAccepts(
  payload: unknown,
  accepts: PaymentRequirements[],
): PaymentRequirements | null {
  if (!payload || typeof payload !== 'object') return null
  const accepted = (payload as { accepted?: { network?: string; amount?: string } }).accepted
  if (!accepted?.network) return null
  return (
    accepts.find(
      (a) =>
        a.network === accepted.network &&
        (accepted.amount == null || a.amount === accepted.amount),
    ) ?? null
  )
}
