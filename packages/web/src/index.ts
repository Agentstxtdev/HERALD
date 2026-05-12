// Re-export everything from core so users only need one package
export * from '@herald/core'

// x402 v2 protocol helpers (atomic units, CAIP-2 networks, facilitator settle)
export * from './x402.js'

// MPP — Machine Payments Protocol via mppx (Stripe + Tempo)
export * from './mpp.js'

// Shared payment gate — framework-neutral fetch-style entry point
export * from './payment-gate.js'

// Framework adapters — import from sub-paths for tree-shaking:
//   @herald/addon/express
//   @herald/addon/nextjs
//   @herald/addon/hono
