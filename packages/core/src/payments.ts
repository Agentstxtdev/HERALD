import type { PaymentConfig } from './types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Honest-declarations helper.
//
// A protocol is "active" only when its prerequisites are actually configured.
// Without this, generated discovery files can declare capabilities the site
// can't fulfil — `Payments: x402, mpp` even with no wallet addresses set.
// Generators consume `resolveActiveProtocols(payments)` instead of trusting
// `payments.protocols` blindly.
//
//   x402  active when treasury.evmAddress OR treasury.solanaAddress is set
//   mpp   active when tempoRecipient is set
//                  OR (stripeSecretKey AND stripeNetworkId) are set
//
// If the user explicitly set `payments.protocols`, the result is the
// intersection — the user's order is preserved, but a protocol they listed
// without backing is dropped.
// ─────────────────────────────────────────────────────────────────────────────

export type Protocol = 'x402' | 'mpp'

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
 * Returns the protocols that have backing implementations.
 * Honors `payments.protocols` ordering when set; otherwise defaults to
 * `['mpp', 'x402']` order.
 */
export function resolveActiveProtocols(payments: PaymentConfig): Protocol[] {
  const active: Protocol[] = []
  const declared = payments.protocols
  const order: Protocol[] = declared && declared.length > 0 ? [...declared] : ['mpp', 'x402']
  for (const p of order) {
    if (p === 'x402' && isX402Active(payments)) active.push('x402')
    if (p === 'mpp' && isMppActive(payments)) active.push('mpp')
  }
  return active
}
