import type { AgenticConfig } from '@agentify/core'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com'
const EVM_ADDRESS = process.env.EVM_ADDRESS
const SOLANA_ADDRESS = process.env.SOLANA_ADDRESS
const MPP_TEMPO_RECIPIENT = process.env.MPP_TEMPO_RECIPIENT  // EVM address for Tempo USDC payments
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const STRIPE_NETWORK_ID = process.env.STRIPE_NETWORK_ID

const hasMpp = !!(MPP_TEMPO_RECIPIENT || (STRIPE_SECRET_KEY && STRIPE_NETWORK_ID))
const hasX402 = !!(EVM_ADDRESS || SOLANA_ADDRESS)

const config: AgenticConfig = {
  site: {
    name: 'My Next.js Site',
    url: SITE_URL,
    description: 'A Next.js site that AI agents can discover and pay to access.',
  },

  content: {
    driver: process.env.FIRECRAWL_API_KEY
      ? {
          type: 'firecrawl',
          siteUrl: SITE_URL,
          apiKey: process.env.FIRECRAWL_API_KEY,
          limit: 50,
        }
      : {
          type: 'sitemap',
          sitemapUrl: `${SITE_URL}/sitemap.xml`,
        },
  },

  crawlers: {
    blockFreeAiScrapers: true,
    allowSearchEngines: true,
    allowPaidAgents: true,
  },

  payments: {
    enabled: hasMpp || hasX402,
    // MPP first (session-based fiat + USDC); x402 as fallback for pure on-chain micropayments
    protocols: [
      ...(hasMpp ? (['mpp'] as const) : []),
      ...(hasX402 ? (['x402'] as const) : []),
    ],

    // MPP — Tempo USDC stablecoins + optional Stripe fiat cards (npm install mppx stripe)
    ...(hasMpp && {
      mpp: {
        ...(process.env.MPP_SECRET_KEY && { secretKey: process.env.MPP_SECRET_KEY }),
        ...(MPP_TEMPO_RECIPIENT && { tempoRecipient: MPP_TEMPO_RECIPIENT }),
        ...(STRIPE_SECRET_KEY && { stripeSecretKey: STRIPE_SECRET_KEY }),
        ...(STRIPE_NETWORK_ID && { stripeNetworkId: STRIPE_NETWORK_ID }),
        pricing: { amount: '0.001', token: 'USD' },
      },
    }),

    // x402 v2 — on-chain USDC via Base (EVM) or Solana (free public facilitator)
    ...(hasX402 && {
      x402: {
        treasury: {
          ...(EVM_ADDRESS && { evmAddress: EVM_ADDRESS, evmChains: ['eip155:8453'] }),
          ...(SOLANA_ADDRESS && { solanaAddress: SOLANA_ADDRESS, solanaNetwork: 'mainnet-beta' }),
        },
        pricing: { amount: '0.001', token: 'USDC' },
      },
    }),
  },
}

export default config
