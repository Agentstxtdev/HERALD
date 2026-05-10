# agentify: code reference

## Full `agentic.config.js` Schema

```js
/** @type {import('@agentify/core').AgenticConfig} */
export default {
  site: {
    name: 'My Site',
    url: 'https://mysite.com',      // valid URL, required
    description: 'One-sentence description for agents.',
  },

  content: {
    driver: {
      // ── Sitemap ──────────────────────────────────────────────────────────
      type: 'sitemap',
      sitemapUrl: 'https://mysite.com/sitemap.xml',

      // ── Firecrawl (richer: titles, descriptions, path grouping) ─────────
      // type: 'firecrawl',
      // siteUrl: 'https://mysite.com',
      // apiKey: process.env.FIRECRAWL_API_KEY,   // free tier: firecrawl.dev
      // limit: 50,

      // ── Static page list ─────────────────────────────────────────────────
      // type: 'static',
      // pages: [{ title: 'Home', url: 'https://mysite.com', description: '...' }],

      // ── Manual sections ──────────────────────────────────────────────────
      // type: 'manual',
      // sections: [{ name: 'Docs', pages: [{ title: '...', url: '...' }] }],
    },
    llmsFullTxt: false,  // true → also generate llms-full.txt
  },

  crawlers: {
    blockFreeAiScrapers: true,   // GPTBot, ClaudeBot, CCBot, Google-Extended, etc.
    allowSearchEngines: true,    // Googlebot, Bingbot, etc.
    allowPaidAgents: true,       // agents paying via x402 / MPP
  },

  payments: {
    enabled: true,
    protocols: ['mpp', 'x402'],  // MPP verified first — agents see only one 402

    x402: {
      treasury: {
        evmAddress: '0xYourEVMWallet',    // 40-char hex, 0x prefix (EVM)
        evmChains: ['eip155:8453'],        // Base (cheap gas, USDC native)
        // solanaAddress: 'YourBase58Key',
        // solanaNetwork: 'mainnet-beta',
      },
      pricing: { amount: '0.001', token: 'USDC' },     // default per-request price
      perPath: {
        '/api/premium': { amount: '0.01', token: 'USDC' },  // per-route override
      },
    },

    mpp: {
      // Stripe fiat (requires stripeSecretKey + stripeNetworkId)
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,   // sk_... — enables fiat cards
      stripeNetworkId: process.env.STRIPE_NETWORK_ID,   // Stripe Business Network profile ID
      // Tempo stablecoin (requires tempoRecipient)
      tempoEnabled: true,                               // USDC on Tempo chain
      tempoRecipient: '0xYourEVMWallet',                // wallet address for Tempo payments
      pricing: { amount: '0.001', token: 'USD' },       // major-unit decimal; converted per method (Stripe → cents, Tempo → atomic USDC)
    },

    exemptUserAgents: [],  // user-agent strings that bypass payment entirely
  },
}
```

---

## Middleware Snippets

### Express

```ts
import express from 'express'
import { createAgenticRouter, agenticPaymentMiddleware } from '@agentify/web/express'
import config from './agentic.config.js'

const app = express()

// Serves /robots.txt, /llms.txt, /agents.json — no payment required
app.use(createAgenticRouter(config))

// Payment gate — MUST be called at module load time, never inside a request handler
// The x402 SDK initializes internal state (facilitator connections, chain scheme
// registrations) on construction. Calling this per-request is a bug.
app.use('/api', agenticPaymentMiddleware(config, '/api'))

app.get('/api/content', (req, res) => res.json({ data: 'paid content' }))
app.listen(3000)
```

### Next.js (App Router)

File structure required:
```
app/
├── robots.txt/route.ts
├── llms.txt/route.ts
├── agents.json/route.ts
└── api/content/route.ts
middleware.ts         ← gates /api/* at the edge
agentic.config.js     ← project root
```

```ts
// app/robots.txt/route.ts
import { robotsTxtHandler } from '@agentify/web/nextjs'
import config from '@/agentic.config'
export const GET = robotsTxtHandler(config)

// app/llms.txt/route.ts
import { llmsTxtHandler } from '@agentify/web/nextjs'
import config from '@/agentic.config'
export const GET = llmsTxtHandler(config)

// app/agents.json/route.ts
import { agentsJsonHandler } from '@agentify/web/nextjs'
import config from '@/agentic.config'
export const GET = agentsJsonHandler(config)

// middleware.ts — runs at the edge before API routes
import { createPaymentProxy } from '@agentify/web/nextjs'
import agenticConfig from './agentic.config.js'
export default createPaymentProxy(agenticConfig, '/api')
export const config = { matcher: ['/api/:path*'] }

// app/api/content/route.ts — no extra code; middleware handles 402
export async function GET() {
  return Response.json({ data: 'paid content' })
}
```

### Hono

```ts
import { Hono } from 'hono'
import { createAgenticRoutes, agenticPaymentMiddleware } from '@agentify/web/hono'
import config from './agentic.config.js'

const app = new Hono()
createAgenticRoutes(app, config)
app.use('/api/*', agenticPaymentMiddleware(config, '/api'))
app.get('/api/content', (c) => c.json({ data: 'paid content' }))

export default app
```

---

## CLI Flags Reference

```bash
npx agentify init [options]
  --name <name>          Site name
  --url <url>            Site URL
  --sitemap <url>        Sitemap URL
  --wallet <0x...>       Treasury EVM wallet address
  --firecrawl-key <key>  Firecrawl API key
  -y, --yes              Skip all prompts, use detected defaults

npx agentify generate [options]
  -c, --config <path>    Config file path (default: ./agentic.config.js)
  -o, --out <dir>        Output directory (default: ./public)

  # Positive selectors — pass any to emit only those files
  --robots               Emit robots.txt
  --llms                 Emit llms.txt
  --llms-full            Emit llms-full.txt (requires content.fullTxt)
  --agents               Emit agents.txt + agents.json
  --sitemap              Emit sitemap.xml (also forces emission for the firecrawl driver)
  --headers              Emit §4.5 headers config (`_headers` for Cloudflare/Netlify,
                         `vercel.json` for Vercel, fallback `_headers` otherwise)
  --platform <name>      Override the detected platform: cloudflare|netlify|vercel|unknown

  # Negative selectors — subtract from the selected (or default) set
  --skip-robots          Skip robots.txt
  --skip-llms            Skip llms.txt
  --skip-llms-full       Skip the Firecrawl scrape; keep llms.txt
  --skip-agents          Skip agents.txt + agents.json
  --skip-sitemap         Never emit sitemap.xml
  --skip-headers         Skip the §4.5 headers config

npx agentify check <url>
  Fetches and scores robots.txt, llms.txt, agents.json, sitemap.xml from live URL
```

### §4.5 Headers — what gets emitted per platform

`agentify generate --headers` produces:

| Detected platform | File written | Path | Strategy |
|---|---|---|---|
| `cloudflare` | `_headers` | `--out` (typically `public/`) | overwrite |
| `netlify` | `_headers` (same syntax) | `--out` | overwrite |
| `vercel` | `vercel.json` | project root | merge `headers[]` (existing entries with a different `source` preserved verbatim; `/agents.txt` and `/agents.json` replaced) |
| `unknown` | `_headers` (best-effort) | `--out` | overwrite + console warning |

Detection (`detectProject().hostingPlatform`) goes file-presence first (`wrangler.json`/`wrangler.toml`/`netlify.toml`/`vercel.json`/`.vercel/`), dep-fallback second (`@astrojs/cloudflare`, `@cloudflare/workers-types`, `wrangler`, `@netlify/plugin-*`, `netlify-cli`).

### §4.5 Headers — manual config for unsupported platforms

For nginx, Apache, Caddy, AWS S3+CloudFront, etc., the headers must be set in the platform's own configuration. Required values are the same:

```
/agents.txt  : Content-Type: text/plain; charset=utf-8 + ACAO: * + Cache-Control: public, max-age=3600
/agents.json : Content-Type: application/json + ACAO: * + Cache-Control: public, max-age=3600
```

---

## Package Sub-paths

```bash
npm install @agentify/web

# Sub-path imports — only pull in what you use:
@agentify/web            → core utils + x402 utils + MPP utils + payment-gate (no framework)
@agentify/web/express    → Express adapter   (peer: express)
@agentify/web/hono       → Hono adapter      (peer: hono)
@agentify/web/nextjs     → Next.js adapter   (peer: next)

# MPP payment verification (optional — install when you want Stripe/Tempo)
npm install mppx stripe
```

x402 v2 uses a hand-rolled facilitator client (default https://x402.org/facilitator). No `@x402/*` SDK is required.

---

## Payment Protocol Flows

### x402 v2 (crypto, per-request)

```
Agent → GET /api/content  (no header)
      ← 402 {
          x402Version: 2,
          resource: { url, description, mimeType: 'application/json' },
          accepts: [{ scheme: 'exact', network: 'eip155:8453', amount: '1000', asset: '0x833…', payTo: '0x…', maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } }]
        }

Agent signs an EIP-3009 authorization (EVM) or builds an SVM payload (Solana)

Agent → GET /api/content  (PAYMENT-SIGNATURE: <base64 PaymentPayload>)
      ← 200 OK  (PAYMENT-RESPONSE: <base64 SettlementResponse>)
```

Verification + settlement: server posts `{ x402Version: 2, paymentPayload, paymentRequirements }` to the facilitator's `/settle`. The free public facilitator at `x402.org` requires no API key.

### MPP (fiat + stablecoins, session-based)

```
Agent → GET /api/content  (no auth header)
      ← 402  WWW-Authenticate: Payment realm="mysite.com" challenge="<id>"
            (body also carries x402 accepts[] — agent picks one protocol)

Agent authorizes via Stripe checkout (fiat / Solana via Stripe) or Tempo wallet (USDC)

Agent → GET /api/content  (Authorization: Payment <credential>)
      ← 200 OK  (Payment-Receipt: { ... })
```

Requires `npm install mppx`. Stripe leg additionally requires `npm install stripe`. If `mppx` is absent → warning logged → MPP path is skipped, x402 still works.

### Gate decision order (all adapters)

```
1. Exempt user-agent? → allow through
2. Authorization: Payment …?  → mppx verifies (Mppx.compose(tempo, stripe)(request))
3. PAYMENT-SIGNATURE / X-Payment? → facilitator settle (x402 v2)
4. No credential → emit a single 402 carrying both x402 accepts[] + MPP WWW-Authenticate
```

---

## `@agentify/core` Key Exports

```ts
// Generators
generateRobotsTxt(config, existingContent?)  → string
generateLlmsTxt(config, driver?)            → Promise<string>
generateLlmsFullTxt(config)                 → Promise<string>
generateAgentsTxt(config)                   → string
generateAgentsJson(config)                  → string
generateSitemapXml(pages)                   → string

// Validators (spec compliance checks on generated output, not user input)
validateRobotsTxt(txt, config)  → ValidationResult[]
validateLlmsTxt(txt)            → ValidationResult[]
validateAgentsTxt(txt)          → ValidationResult[]
validateAgentsJson(json)        → ValidationResult[]
validateSitemapXml(xml)         → ValidationResult[]

// ContentDriver factories (inject in tests)
sitemapDriver(opts)    → ContentDriver
firecrawlDriver(opts)  → ContentDriver
staticDriver(pages)    → ContentDriver   // ← use this in tests; no network calls
manualDriver(sections) → ContentDriver
```

Zero runtime dependencies, safe on Node.js, edge runtimes, Deno, Bun.
