// Re-export everything from core so users only need one package
export * from '@agentify/core'

// x402 v2 protocol helpers (atomic units, CAIP-2 networks, facilitator settle)
export * from './x402.js'

// MPP — Machine Payments Protocol via mppx (Stripe + Tempo)
export * from './mpp.js'

// Shared payment gate — framework-neutral fetch-style entry point
export * from './payment-gate.js'

// Framework adapters — import from sub-paths for tree-shaking:
//   @agentify/web/express
//   @agentify/web/nextjs
//   @agentify/web/hono
