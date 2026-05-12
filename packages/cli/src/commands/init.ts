import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { detectProject } from '../project-probe.js'
import { writeAgenticConfig, type AgenticConfigChoices } from '../config-writer.js'

interface InitOptions {
  name?: string
  url?: string
  sitemap?: string
  wallet?: string
  firecrawlKey?: string
  yes?: boolean
}

function createPrompter(rl: readline.Interface | null, skipAll: boolean) {
  return async (question: string, fallback = ''): Promise<string> => {
    if (skipAll || !rl) return fallback
    const answer = await rl.question(question)
    return answer.trim() || fallback
  }
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log('\n🤖 HERALD — init\n')

  // ── Auto-detect project environment ───────────────────────────────────────
  const detected = detectProject()

  if (detected.framework !== 'unknown') {
    console.log(`   Detected framework: ${detected.framework}`)
  }
  if (detected.hasSitemap) console.log(`   Detected sitemap.xml`)
  if (detected.hasExistingRobots) console.log(`   Detected existing robots.txt (will merge)`)
  if (detected.hasExistingLlms) console.log(`   Detected existing llms.txt`)
  if (detected.envEvmAddress) console.log(`   Detected EVM wallet address in env`)
  if (detected.envSolanaAddress) console.log(`   Detected Solana wallet address in env`)
  if (detected.envStripeKey) console.log(`   Detected Stripe secret key in env — MPP pre-selected`)
  if (detected.envTempoKey) console.log(`   Detected Tempo API key in env — MPP pre-selected`)
  if (detected.envFirecrawlKey) console.log(`   Detected Firecrawl API key in env`)
  console.log()

  const rl = options.yes
    ? null
    : readline.createInterface({ input: stdin, output: stdout })

  const prompt = createPrompter(rl, !!options.yes)

  // ── Site info ──────────────────────────────────────────────────────────────
  const siteName =
    options.name ??
    (await prompt(`Site name (detected: ${detected.siteName}): `, detected.siteName))

  const siteUrl =
    options.url ??
    (await prompt(`Site URL (detected: ${detected.siteUrl}): `, detected.siteUrl))

  const description = await prompt(
    'One-sentence description for agents: ',
    `${siteName} — accessible to AI agents.`,
  )

  // ── Content source ─────────────────────────────────────────────────────────
  const defaultContent = detected.envFirecrawlKey
    ? 'firecrawl'
    : detected.hasSitemap
    ? 'sitemap'
    : 'manual'

  const contentChoice = await prompt(
    `Content source? [sitemap/firecrawl/manual] (detected default: ${defaultContent}): `,
    defaultContent,
  )

  let contentDriver: AgenticConfigChoices['content']

  if (contentChoice === 'firecrawl') {
    const firecrawlKey =
      (options.firecrawlKey ?? detected.envFirecrawlKey) ||
      (await prompt('Firecrawl API key (free at firecrawl.dev — no credit card): ', ''))
    contentDriver = { type: 'firecrawl', siteUrl, firecrawlKey }
  } else if (contentChoice === 'manual') {
    contentDriver = { type: 'manual', siteUrl }
  } else {
    const sitemapUrl =
      options.sitemap ??
      (await prompt(
        `Sitemap URL (detected: ${detected.sitemapUrl || siteUrl + '/sitemap.xml'}): `,
        detected.sitemapUrl || `${siteUrl}/sitemap.xml`,
      ))
    contentDriver = { type: 'sitemap', sitemapUrl }
  }

  // ── Payment protocols ──────────────────────────────────────────────────────
  const enablePayments = await prompt('Enable agent payments? [y/N]: ', 'n')

  let payments: AgenticConfigChoices['payments']

  if (enablePayments.toLowerCase().startsWith('y')) {
    const defaultProtocols = 'mpp,x402'
    const protocolChoice = await prompt(
      `Payment protocols? [mpp / x402 / mpp,x402] (default: ${defaultProtocols}): `,
      defaultProtocols,
    )
    const protocols = protocolChoice
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p === 'x402' || p === 'mpp')
    if (protocols.length === 0) protocols.push('x402')

    let x402Choice: { evmAddress: string; solanaAddress: string; priceAmount: string } | undefined
    let mppChoice: { tempoRecipient: string; stripeKey: string; stripeNetworkId: string } | undefined

    if (protocols.includes('x402')) {
      const evmAddress =
        (options.wallet ?? detected.envEvmAddress) ||
        (await prompt('EVM wallet address (0x... on Base/Ethereum, leave blank to skip): ', ''))

      const solanaAddress =
        detected.envSolanaAddress ||
        (await prompt('Solana wallet address (base58, leave blank to skip): ', ''))

      if (!evmAddress && !solanaAddress) {
        console.log('   ⚠  No wallet address provided — x402 payments will be disabled.')
      } else {
        const priceAmount = await prompt(
          'Default price per request in USDC (default: 0.001): ',
          '0.001',
        )
        x402Choice = { evmAddress, solanaAddress, priceAmount }
      }
    }

    if (protocols.includes('mpp')) {
      console.log('\n   MPP (Machine Payments Protocol) supports fiat cards + USDC via Tempo.')
      console.log('   Requires: npm install mppx\n')

      const tempoRecipient =
        detected.envEvmAddress ||
        (await prompt(
          'Tempo recipient address (0x... EVM — for USDC stablecoin payments, leave blank to skip): ',
          '',
        ))

      const stripeKey =
        detected.envStripeKey ||
        (await prompt(
          'Stripe secret key (sk_... — for fiat card support, leave blank for USDC-only): ',
          '',
        ))

      const stripeNetworkId = stripeKey
        ? (await prompt(
            'Stripe Business Network profile ID (from Stripe dashboard → Network, required with stripeSecretKey): ',
            '',
          ))
        : ''

      mppChoice = { tempoRecipient, stripeKey, stripeNetworkId }
    }

    payments = {
      protocols,
      ...(x402Choice !== undefined ? { x402: x402Choice } : {}),
      ...(mppChoice !== undefined ? { mpp: mppChoice } : {}),
    }
  }

  // ── A2A AgentCard discovery ────────────────────────────────────────────────
  // Optional. Sites running A2A agents declare their AgentCard URLs here so
  // multi-agent or non-canonically-pathed setups stay discoverable.
  let a2a: AgenticConfigChoices['a2a']
  const enableA2A = await prompt('Declare A2A agents (a2a-protocol.org)? [y/N]: ', 'n')
  if (enableA2A.toLowerCase().startsWith('y')) {
    const a2aDefault = `${siteUrl.replace(/\/$/, '')}/.well-known/agent-card.json`
    const cardLine = await prompt(
      `AgentCard URL(s), comma-separated (default: ${a2aDefault}): `,
      a2aDefault,
    )
    const cards = cardLine
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)
    if (cards.length > 0) {
      a2a = { cards }
    }
  }

  rl?.close()

  // ── Write config ───────────────────────────────────────────────────────────
  const configPath = resolve('agentic.config.js')
  const choices: AgenticConfigChoices = {
    siteName,
    siteUrl,
    description,
    framework: detected.framework,
    content: contentDriver,
    ...(payments !== undefined ? { payments } : {}),
    ...(a2a !== undefined ? { a2a } : {}),
  }

  if (existsSync(configPath)) {
    const rl2 = readline.createInterface({ input: stdin, output: stdout })
    const overwrite = await createPrompter(rl2, !!options.yes)(
      'agentic.config.js already exists. Overwrite? [y/N]: ',
      'n',
    )
    rl2.close()
    if (!overwrite.toLowerCase().startsWith('y')) {
      console.log('   Skipped — config unchanged.')
      return
    }
  }

  writeAgenticConfig(configPath, choices)
  console.log(`\n✅ Created agentic.config.js\n`)

  // ── Next steps tailored to detected framework ──────────────────────────────
  console.log(`Next steps:`)

  if (detected.framework === 'nextjs') {
    console.log(`  1. npm install @herald/addon`)
    console.log(`  2. Create app/robots.txt/route.ts  → export const GET = robotsTxtHandler(config)`)
    console.log(`  3. Create app/llms.txt/route.ts    → export const GET = llmsTxtHandler(config)`)
    console.log(`  4. Create app/agents.txt/route.ts → export const GET = agentsTxtHandler(config)`)
  } else if (detected.framework === 'express' || detected.framework === 'hono') {
    console.log(`  1. npm install @herald/addon`)
    console.log(`  2. app.use(createAgenticRouter(config))`)
    console.log(`  3. app.use('/api', agenticPaymentMiddleware(config))`)
  } else {
    console.log(`  1. herald generate --out ./public`)
    console.log(`  2. Deploy the generated files with your site`)
  }

  if (contentChoice === 'firecrawl') {
    console.log(`  • Set FIRECRAWL_API_KEY in .env (free at firecrawl.dev)`)
  }

  if (payments?.protocols?.includes('mpp')) {
    console.log(`  • npm install mppx  (required for MPP payment verification)`)
  }

  console.log()
  console.log(`  Run: herald check ${siteUrl.trim()}  (after deploying to verify compliance)`)
  console.log()
}
