// ─────────────────────────────────────────────────────────────────────────────
// Protocol registry — single source of truth
//
// Every protocol identifier and block-opening directive that agentify
// recognises is declared in this file. The generators, validators, and CLI
// schema all read from here.
//
// Adding a new protocol is a matter of:
//   1. Adding its identifier to PAYMENT_PROTOCOLS / AUTH_PROTOCOLS (or a new
//      registry if it's a new block kind), and
//   2. Wiring it into the relevant generator (`agents-txt.ts`, `agents-json.ts`)
//      and the `payments.ts` active-check helper if it has runtime gating.
//
// Experimental / unregistered identifiers MAY use the `x-` prefix
// (e.g. `x-mypay`). Parsers MUST accept them; validators MUST NOT warn.
// This mirrors the convention in the agents.txt spec §3.1.
//
// Standard: https://agentstxt.dev
// ─────────────────────────────────────────────────────────────────────────────

export const PAYMENT_PROTOCOLS = ['x402', 'mpp'] as const
export type PaymentProtocol = (typeof PAYMENT_PROTOCOLS)[number]

export const AUTH_PROTOCOLS = ['agent-auth'] as const
export type AuthProtocol = (typeof AUTH_PROTOCOLS)[number]

export const MPP_METHODS = ['tempo', 'stripe'] as const
export type MppMethod = (typeof MPP_METHODS)[number]

/**
 * An experimental payment / auth protocol identifier prefixed with `x-`.
 * Used in the `protocols` config field to advertise a protocol that hasn't
 * been formally registered in the spec yet.
 */
export type ExperimentalProtocol = `x-${string}`

/** Payment protocol identifier accepted by the spec, including experimental forms. */
export type PaymentProtocolId = PaymentProtocol | ExperimentalProtocol

/** Auth protocol identifier accepted by the spec, including experimental forms. */
export type AuthProtocolId = AuthProtocol | ExperimentalProtocol

const KNOWN_PAYMENT_SET: ReadonlySet<string> = new Set(PAYMENT_PROTOCOLS)
const KNOWN_AUTH_SET: ReadonlySet<string> = new Set(AUTH_PROTOCOLS)

export function isExperimentalIdentifier(value: string): boolean {
  return value.startsWith('x-') && value.length > 2
}

export function isKnownPaymentProtocol(value: string): boolean {
  return KNOWN_PAYMENT_SET.has(value)
}

export function isKnownAuthProtocol(value: string): boolean {
  return KNOWN_AUTH_SET.has(value)
}

/**
 * `true` for identifiers that should silently pass validation: either formally
 * registered, or experimental via the `x-` prefix.
 */
export function isAcceptedPaymentIdentifier(value: string): boolean {
  return isKnownPaymentProtocol(value) || isExperimentalIdentifier(value)
}

export function isAcceptedAuthIdentifier(value: string): boolean {
  return isKnownAuthProtocol(value) || isExperimentalIdentifier(value)
}
