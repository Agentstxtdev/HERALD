import { writeFileSync } from 'node:fs'

// ─────────────────────────────────────────────────────────────────────────────
// Config writer — pure template generation + file writing for agentsjson.config.js.
// buildAgenticConfigContent() is a pure string function: it takes structured
// wizard choices and returns a valid JS config file string. No I/O.
// writeAgenticConfig() is the only function that touches the filesystem.
// ─────────────────────────────────────────────────────────────────────────────

/** Safe string embedding — JSON.stringify prevents JS injection in the template. */
export function s(value: string): string {
  return JSON.stringify(value)
}

export interface ContentDriverChoice {
  type: 'firecrawl' | 'sitemap' | 'manual'
  siteUrl?: string
  firecrawlKey?: string
  sitemapUrl?: string
}

export interface X402Choice {
  evmAddress: string
  solanaAddress: string
  priceAmount: string
}

export interface MppChoice {
  tempoRecipient: string
  stripeKey: string
  stripeNetworkId: string
}

export interface A2AChoice {
  cards: string[]
}

export interface AgenticConfigChoices {
  siteName: string
  siteUrl: string
  description: string
  framework: 'nextjs' | 'express' | 'hono' | 'astro' | 'unknown'
  content: ContentDriverChoice
  payments?: {
    protocols: string[]
    x402?: X402Choice
    mpp?: MppChoice
  }
  a2a?: A2AChoice
}

const INTEGRATION_NOTES: Record<string, string> = {
  nextjs: `// Next.js — add app/{robots.txt,llms.txt,agents.txt,agents.json}/route.ts that imports the generators from @agentstxtdev/herald-core and returns the rendered file. See: https://github.com/agents-txt/herald/tree/main/examples/nextjs`,
  express: `// Express — see: https://github.com/agents-txt/herald/tree/main/examples/express`,
  hono: `// Hono — register GET handlers for /robots.txt, /llms.txt, /agents.txt, /agents.json that call the matching @agentstxtdev/herald-core generator.`,
  astro: `// Astro / static — run: herald emit --out ./public`,
  unknown: `// Run: herald emit --out ./public  (then deploy the files with your site)`,
}

function buildContentBlock(choice: ContentDriverChoice): string {
  if (choice.type === 'firecrawl') {
    return `{
    driver: {
      type: 'firecrawl',
      siteUrl: ${s(choice.siteUrl ?? '')},
      apiKey: process.env.FIRECRAWL_API_KEY || ${s(choice.firecrawlKey ?? '')},
      limit: 50,
    },
  }`
  }
  if (choice.type === 'manual') {
    return `{
    driver: {
      type: 'manual',
      sections: [
        {
          name: 'Pages',
          pages: [
            { title: 'Home', url: ${s(choice.siteUrl ?? '')}, description: 'Homepage' },
          ],
        },
      ],
    },
  }`
  }
  // sitemap
  return `{
    driver: {
      type: 'sitemap',
      sitemapUrl: ${s(choice.sitemapUrl ?? '')},
    },
  }`
}

function buildPaymentsBlock(payments: AgenticConfigChoices['payments']): string {
  if (!payments) return ''

  const { protocols, x402, mpp } = payments

  let x402Block = ''
  const hasX402Address = x402 && (x402.evmAddress || x402.solanaAddress)
  if (protocols.includes('x402') && hasX402Address) {
    const evmPart = x402!.evmAddress
      ? `evmAddress: ${s(x402!.evmAddress)},
          evmChains: ['eip155:8453'],  // Base (cheap gas)`
      : ''
    const solanaPart = x402!.solanaAddress
      ? `solanaAddress: ${s(x402!.solanaAddress)},
          solanaNetwork: 'mainnet-beta',`
      : ''
    x402Block = `
      x402: {
        treasury: {
          ${evmPart}
          ${solanaPart}
        },
        pricing: { amount: ${s(x402!.priceAmount)}, token: 'USDC' },
      },`
  } else if (protocols.includes('x402')) {
    x402Block = `
      // x402: {                                          // Uncomment to enable on-chain payments
      //   treasury: {
      //     evmAddress: process.env.EVM_ADDRESS,         // 0x... wallet on Base / Ethereum
      //     evmChains: ['eip155:8453'],                  // Base (cheap gas)
      //     // solanaAddress: process.env.SOLANA_ADDRESS, // base58 wallet (optional)
      //   },
      //   pricing: { amount: '0.001', token: 'USDC' },
      // },`
  }

  const effectiveProtocols = hasX402Address
    ? protocols
    : protocols.filter((p: string) => p !== 'x402')

  let mppBlock = ''
  if (protocols.includes('mpp') && mpp) {
    const tempoLine = mpp.tempoRecipient
      ? `tempoRecipient: process.env.MPP_TEMPO_RECIPIENT || ${s(mpp.tempoRecipient)},`
      : `// tempoRecipient: process.env.MPP_TEMPO_RECIPIENT,  // required for Tempo USDC payments`
    const stripeKeyLine = mpp.stripeKey
      ? `stripeSecretKey: process.env.STRIPE_SECRET_KEY || ${s(mpp.stripeKey)},`
      : `// stripeSecretKey: process.env.STRIPE_SECRET_KEY,  // optional — enables fiat cards`
    const stripeNetworkLine = mpp.stripeNetworkId
      ? `stripeNetworkId: process.env.STRIPE_NETWORK_ID || ${s(mpp.stripeNetworkId)},`
      : `// stripeNetworkId: process.env.STRIPE_NETWORK_ID,  // required with stripeSecretKey`
    mppBlock = `
      mpp: {
        secretKey: process.env.MPP_SECRET_KEY,   // required in production (HMAC challenge binding)
        ${tempoLine}
        ${stripeKeyLine}
        ${stripeNetworkLine}
        pricing: { amount: '0.001', token: 'USD' },
      },`
  }

  return `
  payments: {
    protocols: ${JSON.stringify(effectiveProtocols)},
    ${x402Block}
    ${mppBlock}
    exemptUserAgents: [],  // add user-agents that bypass payment
  },`
}

function buildA2ABlock(a2a: AgenticConfigChoices['a2a']): string {
  if (!a2a || a2a.cards.length === 0) return ''
  const entries = a2a.cards.map((url) => `      ${s(url)}`).join(',\n')
  return `
  a2a: {
    cards: [
${entries},
    ],
  },`
}

export function buildAgenticConfigContent(choices: AgenticConfigChoices): string {
  const integrationNote = INTEGRATION_NOTES[choices.framework] ?? INTEGRATION_NOTES['unknown']!
  const contentBlock = buildContentBlock(choices.content)
  const paymentsBlock = buildPaymentsBlock(choices.payments)
  const a2aBlock = buildA2ABlock(choices.a2a)

  return `// agentsjson.config.js — generated by herald init
// Docs: https://github.com/agents-txt/herald
// Spec: https://github.com/agents-txt/herald/blob/main/spec/AGENTS-TXT-STANDARD.md

${integrationNote}

/** @type {import('@agentstxtdev/herald-core').AgenticConfig} */
export default {
  site: {
    name: ${s(choices.siteName)},
    url: ${s(choices.siteUrl)},
    description: ${s(choices.description)},
  },

  content: ${contentBlock},

  crawlers: {
    blockFreeAiScrapers: true,   // Block GPTBot, ClaudeBot, CCBot, etc.
    allowSearchEngines: true,    // Keep Googlebot, Bingbot, etc.
    allowPaidAgents: true,       // Let x402/MPP-paying agents through
  },
${paymentsBlock}${a2aBlock}
}
`
}

export function writeAgenticConfig(configPath: string, choices: AgenticConfigChoices): void {
  writeFileSync(configPath, buildAgenticConfigContent(choices))
}
