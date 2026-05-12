/**
 * Express example — serves the herald-generated discovery files from a single
 * `AgenticConfig` object. `robots.txt`, `llms.txt`, `agents.txt`, `agents.json`.
 *
 * Run:
 *   SITE_URL=http://localhost:3000 EVM_ADDRESS=0x... node --experimental-strip-types server.ts
 */

import express, { type Request, type Response } from 'express'
import {
  generateRobotsTxt,
  generateLlmsTxt,
  generateAgentsTxt,
  generateAgentsJson,
  type AgenticConfig,
} from '@herald/core'

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000'
const EVM_ADDRESS = process.env.EVM_ADDRESS
const SOLANA_ADDRESS = process.env.SOLANA_ADDRESS
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY

const config: AgenticConfig = {
  site: {
    name: 'My Agentic Site',
    url: SITE_URL,
    description: 'A site that AI agents can discover and understand.',
  },

  content: FIRECRAWL_KEY
    ? { driver: { type: 'firecrawl', siteUrl: SITE_URL, apiKey: FIRECRAWL_KEY, limit: 50 } }
    : { driver: { type: 'sitemap', sitemapUrl: `${SITE_URL}/sitemap.xml` } },

  crawlers: {
    blockFreeAiScrapers: true,
    allowSearchEngines: true,
    allowPaidAgents: true,
  },

  // Payment capability declaration — these values are emitted into agents.txt /
  // agents.json so agents can discover what the site accepts. Implementing the
  // 402 handler is out of scope for this example.
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

const SPEC_HEADERS = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=3600',
}

const app = express()

app.get('/robots.txt', (_req: Request, res: Response) => {
  res.type('text/plain').set(SPEC_HEADERS).send(generateRobotsTxt(config))
})

app.get('/llms.txt', async (_req: Request, res: Response) => {
  res.type('text/plain').set(SPEC_HEADERS).send(await generateLlmsTxt(config))
})

app.get('/agents.txt', (_req: Request, res: Response) => {
  res.type('text/plain; charset=utf-8').set(SPEC_HEADERS).send(generateAgentsTxt(config))
})

app.get('/agents.json', (_req: Request, res: Response) => {
  res.type('application/json').set(SPEC_HEADERS).send(generateAgentsJson(config))
})

app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Agentic-ready website',
    discovery: {
      robotsTxt: `${SITE_URL}/robots.txt`,
      llmsTxt: `${SITE_URL}/llms.txt`,
      agentsTxt: `${SITE_URL}/agents.txt`,
      agentsJson: `${SITE_URL}/agents.json`,
    },
  })
})

const PORT = Number(process.env.PORT ?? 3000)
app.listen(PORT, () => {
  console.log(`\n🤖 Agentic server running at ${SITE_URL}`)
  console.log(`   robots.txt  → ${SITE_URL}/robots.txt`)
  console.log(`   llms.txt    → ${SITE_URL}/llms.txt`)
  console.log(`   agents.txt  → ${SITE_URL}/agents.txt`)
  console.log(`   agents.json → ${SITE_URL}/agents.json\n`)
})
