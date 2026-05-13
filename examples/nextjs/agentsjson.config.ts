import type { AgenticConfig } from '@agentstxtdev/herald-core'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com'
const EVM_ADDRESS = process.env.EVM_ADDRESS
const SOLANA_ADDRESS = process.env.SOLANA_ADDRESS

const config: AgenticConfig = {
  site: {
    name: 'My Next.js Site',
    url: SITE_URL,
    description: 'A Next.js site that AI agents can discover and understand.',
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

  // Payment capability declaration — emitted into agents.txt / agents.json so
  // agents can discover what the site accepts. The 402 handler is out of scope.
  payments: {
    protocols: ['x402'],
    x402: {
      treasury: {
        ...(EVM_ADDRESS && { evmAddress: EVM_ADDRESS, evmChains: ['eip155:8453'] }),
        ...(SOLANA_ADDRESS && { solanaAddress: SOLANA_ADDRESS, solanaNetwork: 'mainnet-beta' }),
      },
      pricing: { amount: '0.001', token: 'USDC' },
    },
  },
}

export default config
