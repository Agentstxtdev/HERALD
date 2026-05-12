import type { PaymentConfig } from './types.js'
import type { PaymentProtocolId } from './protocols.js'
import { isExperimentalIdentifier } from './protocols.js'

// ─────────────────────────────────────────────────────────────────────────────
// Honest-declarations helper.
//
// A protocol is "active" only when its prerequisites are actually configured.
// Without this, generated discovery files can declare capabilities the site
// can't fulfil — `Payments: x402, mpp` even with no wallet addresses set.
// Generators consume `resolveActiveProtocols(payments)` instead of trusting
// `payments.protocols` blindly.
//
//   x402   active when treasury.evmAddress OR treasury.solanaAddress is set
//   mpp    active when tempoRecipient is set
//                   OR (stripeSecretKey AND stripeNetworkId) are set
//   x-…    experimental identifiers (spec §3.1) pass through verbatim;
//          activity gating is the caller's responsibility
//
// If the user explicitly set `payments.protocols`, the result is the
// intersection — the user's order is preserved, but a registered protocol
// they listed without backing is dropped.
// ─────────────────────────────────────────────────────────────────────────────

export type Protocol = PaymentProtocolId

export function isX402Active(payments: PaymentConfig): boolean {
  const t = payments.x402?.treasury
  return !!(t?.evmAddress || t?.solanaAddress)
}

export function isMppActive(payments: PaymentConfig): boolean {
  const m = payments.mpp
  if (!m) return false
  if (m.tempoRecipient) return true
  if (m.stripeSecretKey && m.stripeNetworkId) return true
  return false
}

/**
 * AP2 is a mandate trust layer that composes with the underlying rail (x402 or
 * MPP). It has no credentials of its own at the discovery layer; the operator
 * declares it by setting `payments.ap2`. Presence of the config object is the
 * support signal.
 */
export function isAp2Active(payments: PaymentConfig): boolean {
  return payments.ap2 !== undefined
}

/**
 * Returns the protocols that have backing implementations.
 * Honors `payments.protocols` ordering when set; otherwise defaults to
 * `['mpp', 'x402']` order. Experimental identifiers (`x-…`) pass through
 * verbatim — the registry has no runtime contract for them.
 */
export function resolveActiveProtocols(payments: PaymentConfig): Protocol[] {
  const active: Protocol[] = []
  const declared = payments.protocols
  const defaultOrder: Protocol[] = ['mpp', 'x402']
  if (isAp2Active(payments) && !defaultOrder.includes('ap2' as Protocol)) defaultOrder.push('ap2' as Protocol)
  const order: Protocol[] = declared && declared.length > 0 ? [...declared] : defaultOrder
  for (const p of order) {
    if (p === 'x402' && isX402Active(payments)) active.push('x402')
    else if (p === 'mpp' && isMppActive(payments)) active.push('mpp')
    else if (p === 'ap2' && isAp2Active(payments)) active.push('ap2' as Protocol)
    else if (isExperimentalIdentifier(p)) active.push(p)
  }
  // Defensive: if a registered protocol is configured (its config object is
  // present and would otherwise activate) but the operator forgot to list it
  // in `payments.protocols`, append it anyway. Presence of the config object
  // is the support signal; the explicit list is for ordering only.
  if (isAp2Active(payments) && !active.includes('ap2' as Protocol)) active.push('ap2' as Protocol)
  return active
}
