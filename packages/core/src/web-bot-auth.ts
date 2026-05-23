// ─────────────────────────────────────────────────────────────────────────────
// Web Bot Auth directory — /.well-known/http-message-signatures-directory
//
// JWKSet listing the Ed25519 public keys an agentic crawler operating this
// site signs with. Implements the discovery half of the IETF HTTP Message
// Signatures draft and the Web Bot Auth profile that AEO scanners probe.
//
// Honest-declarations rule: emits null when `webBotAuth.keys` is absent or
// empty. The published JWK is the public half only; the private key lives in
// the adopter's runtime (worker secret, KMS, etc.) and is never written here.
//
// Rotation procedure for adopters:
//   1. Generate a fresh Ed25519 keypair (Node:
//      `crypto.generateKeyPairSync('ed25519')`).
//   2. Compute `kid` as the RFC 7638 thumbprint of the public JWK.
//   3. Set `nbf` = now, `exp` = now + 1 year (the IETF draft suggests a year).
//   4. Add the new key to `webBotAuth.keys`. Keep the old entry until its
//      `exp` passes so already-verified requests with the old kid still
//      validate.
//   5. Re-emit + redeploy.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig } from './types.js'

export function generateWebBotAuthDirectory(config: AgenticConfig): string | null {
  const keys = config.webBotAuth?.keys
  if (!keys || keys.length === 0) return null

  const directory = {
    keys: keys.map((k) => ({
      kty: k.kty,
      crv: k.crv,
      x:   k.x,
      kid: k.kid,
      ...(k.alg ? { alg: k.alg } : { alg: 'EdDSA' as const }),
      ...(k.use ? { use: k.use } : { use: 'sig' as const }),
      nbf: k.nbf,
      exp: k.exp,
    })),
  }

  return JSON.stringify(directory, null, 2) + '\n'
}
