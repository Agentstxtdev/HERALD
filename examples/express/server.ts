/**
 * Express example — @agentify/web
 *
 * Demonstrates:
 *  1. Auto-serving /robots.txt, /llms.txt, /agents.txt
 *  2. x402 payment gate on /api/* — supports EVM (Base) + Solana simultaneously
 *  3. MPP (Stripe) as an optional additional protocol — fiat + stablecoin sessions
 *  4. Firecrawl-powered llms.txt (optional — set FIRECRAWL_API_KEY)
 *
 * Run:
 *   EVM_ADDRESS=0x...  SOLANA_ADDRESS=...  node --experimental-strip-types server.ts
 *
 * With MPP (Tempo USDC + optional Stripe fiat):
 *   MPP_TEMPO_RECIPIENT=0x...  STRIPE_SECRET_KEY=sk_...  STRIPE_NETWORK_ID=net_...  node --experimental-strip-types server.ts
 */

import express, { type Request, type Response } from 'express'
import { createAgenticRouter, agenticPaymentMiddleware } from '@agentify/web/express'
import type { AgenticConfig } from '@agentify/core'

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000'
const EVM_ADDRESS = process.env.EVM_ADDRESS
const SOLANA_ADDRESS = process.env.SOLANA_ADDRESS
const MPP_TEMPO_RECIPIENT = process.env.MPP_TEMPO_RECIPIENT
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const STRIPE_NETWORK_ID = process.env.STRIPE_NETWORK_ID
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY

const hasMpp = !!(MPP_TEMPO_RECIPIENT || (STRIPE_SECRET_KEY && STRIPE_NETWORK_ID))
const hasX402 = !!(EVM_ADDRESS || SOLANA_ADDRESS)

if (!hasMpp && !hasX402) {
  console.warn('⚠  No payment credentials set — payments will be disabled.')
}

// ─────────────────────────────────────────────────────────────────────────────
// Agentic configuration — single object drives all generators + middleware
// ─────────────────────────────────────────────────────────────────────────────

const config: AgenticConfig = {
  site: {
    name: 'My Agentic Site',
    url: SITE_URL,
    description: 'A site that AI agents can discover, understand, and pay to access.',
  },

  content: FIRECRAWL_KEY
    ? {
        driver: {
          type: 'firecrawl',
          siteUrl: SITE_URL,
          apiKey: FIRECRAWL_KEY,
          limit: 50,
        },
      }
    : {
        driver: {
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
        secretKey: process.env.MPP_SECRET_KEY,
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
          ...(EVM_ADDRESS && { evmAddress: EVM_ADDRESS, evmChains: ['eip155:8453', 'eip155:1'] }),
          ...(SOLANA_ADDRESS && { solanaAddress: SOLANA_ADDRESS, solanaNetwork: 'mainnet-beta' }),
        },
        pricing: { amount: '0.001', token: 'USDC' },
        perPath: {
          '/api/premium': { amount: '0.01', token: 'USDC' },
          '/api/content': { amount: '0.001', token: 'USDC' },
        },
      },
    }),

    exemptUserAgents: ['MyOwnAgent/1.0'],
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

// 1. Serve /robots.txt, /llms.txt, /agents.txt
app.use(createAgenticRouter(config))

// 2. Public routes
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Agentic-ready website',
    discovery: {
      llmsTxt: `${SITE_URL}/llms.txt`,
      agentsTxt: `${SITE_URL}/agents.txt`,
      robotsTxt: `${SITE_URL}/robots.txt`,
    },
    paymentProtocols: config.payments?.protocols ?? [],
    networks: {
      evm: config.payments?.x402?.treasury.evmChains ?? [],
      solana: config.payments?.x402?.treasury.solanaAddress ? config.payments.x402.treasury.solanaNetwork : null,
    },
  })
})

// 3. x402 + MPP payment gate on all /api/* routes
app.use('/api', agenticPaymentMiddleware(config))

// 4. Payment-gated endpoints
app.get('/api/content', (_req: Request, res: Response) => {
  res.json({
    data: 'Paid content. You successfully paid 0.001 USDC (EVM or Solana) or authorized via MPP.',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/premium', (_req: Request, res: Response) => {
  res.json({
    data: 'Premium content — 0.01 USDC.',
    analysis: { sentiment: 'positive', score: 0.92 },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000)
app.listen(PORT, () => {
  console.log(`\n🤖 Agentic server running at ${SITE_URL}`)
  console.log(`   robots.txt  → ${SITE_URL}/robots.txt`)
  console.log(`   llms.txt    → ${SITE_URL}/llms.txt`)
  console.log(`   agents.txt  → ${SITE_URL}/agents.txt`)
  console.log(`\n   Payment protocols:`)
  if (MPP_TEMPO_RECIPIENT) console.log(`   ✓ MPP / Tempo USDC → ${MPP_TEMPO_RECIPIENT}`)
  if (STRIPE_SECRET_KEY && STRIPE_NETWORK_ID) console.log(`   ✓ MPP / Stripe fiat`)
  if (EVM_ADDRESS) console.log(`   ✓ x402 / EVM (Base + Ethereum) → ${EVM_ADDRESS}`)
  if (SOLANA_ADDRESS) console.log(`   ✓ x402 / Solana → ${SOLANA_ADDRESS}`)
  if (!hasMpp && !hasX402) console.log(`   ✗ Payments disabled (no credentials set)`)
  console.log()
})
