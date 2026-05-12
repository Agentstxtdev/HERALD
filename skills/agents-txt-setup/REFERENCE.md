# herald: code reference

## Full `agentsjson.config.js` Schema

```js
/** @type {import('@herald/core').AgenticConfig} */
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
    // Registered identifiers ('x402', 'mpp', 'ap2') plus any 'x-' prefixed
    // experimental identifier (e.g. 'x-mypay') per agents.txt spec §3.1.
    protocols: ['x402', 'mpp', 'ap2'],

    x402: {
      treasury: {
        evmAddress: process.env.EVM_ADDRESS,   // 40-char hex, 0x prefix
        evmChains: ['eip155:8453'],             // Base (cheap gas, USDC native)
        solanaAddress: process.env.SOLANA_ADDRESS,
        solanaNetwork: 'mainnet-beta',
      },
      pricing: { amount: '0.001', token: 'USDC' },     // default per-request price
      perPath: {
        '/api/premium': { amount: '0.01', token: 'USDC' },  // per-route override
      },
    },

    mpp: {
      tempoRecipient: process.env.TREASURY_TEMPO,        // USDC on Tempo chain
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,    // sk_..., enables fiat cards
      stripeNetworkId: process.env.STRIPE_NETWORK_ID,    // Stripe Business Network profile ID
      pricing: { amount: '0.001', token: 'USD' },        // major-unit decimal
    },

    // AP2 mandate layer (ap2-protocol.org, spec §8.3). Announces support;
    // mandate exchange (CheckoutMandate / PaymentMandate) happens during checkout.
    ap2: {
      presentations: ['sd-jwt-vc'],
      spec: 'https://ap2-protocol.org',
    },

    exemptUserAgents: [],  // user-agent strings that bypass payment entirely
  },

  authorization: {
    enabled: true,
    protocols: ['agent-auth'],  // 'agent-auth' or any 'x-' prefixed experimental identifier
    identityRequired: false,    // true emits Identity: required + identity: 'required'
  },

  mcp: {
    endpoints: {
      url: 'https://mysite.com/mcp',
      description: 'Public API surface.',
    },
  },

  skills: {
    urls: {
      url: 'https://mysite.com/skills/main/SKILL.md',
      description: 'Teaches agents how to use this site.',
    },
  },

  // A2A AgentCard discovery (a2a-protocol.org, spec §9).
  a2a: {
    cards: {
      url: 'https://mysite.com/.well-known/agent-card.json',
      description: 'Primary agent card.',
    },
  },

  // UCP profile discovery (ucp.dev, spec §10).
  ucp: {
    profiles: {
      url: 'https://mysite.com/.well-known/ucp',
      description: 'UCP profile for commerce capabilities.',
    },
  },
}
```

### Wallet env vars: lenient per-field validation

The wallet format checks in the CLI Zod schema (`evmAddress` must be `0x[40 hex]`, `solanaAddress` must be 32-char base58 minimum, `stripeSecretKey` must start with `sk_`) stay strict, but they are *per-field lenient*: a malformed optional field warns and is skipped, rather than aborting the entire generate. So `EVM_ADDRESS=garbage` in `.env` when only Solana is wired produces a warning and lets the Solana side through:

```
herald: ignoring malformed evmAddress (...); set EVM_ADDRESS to a valid 0x[40 hex] value or unset to skip EVM.
```

The `TreasuryConfigSchema.refine` rule still applies after the lenient pass: if every wallet in `payments.x402.treasury` ends up dropped, x402 fails with `treasury must include at least one of evmAddress or solanaAddress (after lenient validation)`. The same lenient pattern applies to `stripeSecretKey` (warns and drops if the prefix check fails; MPP loses Stripe support but Tempo can still activate).

Per-protocol activation is itself gated on the wallet survivors: `evmChains` only emit in `agents.json` when `evmAddress` is a valid string, and Solana chains only emit when `solanaAddress` is. So a Solana-only `.env` produces `payments.x402.chains: ["solana:..."]` exactly, no Base default leaked in.

---

## Middleware Snippets

### Express

```ts
import express from 'express'
import { createAgenticRouter, agenticPaymentMiddleware } from '@herald/addon/express'
import config from './agentsjson.config.js'

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
agentsjson.config.js     ← project root
```

```ts
// app/robots.txt/route.ts
import { robotsTxtHandler } from '@herald/addon/nextjs'
import config from '@/agentsjson.config'
export const GET = robotsTxtHandler(config)

// app/llms.txt/route.ts
import { llmsTxtHandler } from '@herald/addon/nextjs'
import config from '@/agentsjson.config'
export const GET = llmsTxtHandler(config)

// app/agents.json/route.ts
import { agentsJsonHandler } from '@herald/addon/nextjs'
import config from '@/agentsjson.config'
export const GET = agentsJsonHandler(config)

// middleware.ts — runs at the edge before API routes
import { createPaymentProxy } from '@herald/addon/nextjs'
import agenticConfig from './agentsjson.config.js'
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
import { createAgenticRoutes, agenticPaymentMiddleware } from '@herald/addon/hono'
import config from './agentsjson.config.js'

const app = new Hono()
createAgenticRoutes(app, config)
app.use('/api/*', agenticPaymentMiddleware(config, '/api'))
app.get('/api/content', (c) => c.json({ data: 'paid content' }))

export default app
```

---

## CLI Flags Reference

```bash
herald init [options]
  --name <name>          Site name
  --url <url>            Site URL
  --sitemap <url>        Sitemap URL
  --wallet <0x...>       Treasury EVM wallet address
  --firecrawl-key <key>  Firecrawl API key
  -y, --yes              Skip all prompts, use detected defaults

herald generate [options]
  -c, --config <path>    Config file path (default: ./agentsjson.config.js)
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

herald check <url>
  Fetches and scores robots.txt, llms.txt, agents.json, sitemap.xml from live URL
```

### §4.5 Headers — what gets emitted per platform

`herald generate --headers` produces:

| Detected platform | File written | Path | Strategy |
|---|---|---|---|
| `cloudflare` | `_headers` | `--out` (typically `public/`) | overwrite |
| `netlify` | `_headers` (same syntax) | `--out` | overwrite |
| `vercel` | `vercel.json` | project root | merge `headers[]` (existing entries with a different `source` preserved verbatim; herald-managed sources replaced) |
| `unknown` | `_headers` (best-effort) | `--out` | overwrite + console warning |

Detection (`detectProject().hostingPlatform`) goes file-presence first (`wrangler.json`/`wrangler.toml`/`netlify.toml`/`vercel.json`/`.vercel/`), dep-fallback second (`@astrojs/cloudflare`, `@cloudflare/workers-types`, `wrangler`, `@netlify/plugin-*`, `netlify-cli`).

**Always emitted (spec §4.5):** `/agents.txt` and `/agents.json`.

**Conditionally emitted from config:**

- `a2a.cards`: every same-origin AgentCard URL gets a matching entry with `Content-Type: application/json`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`. AgentCards on a different origin from `site.url` are skipped (their headers are not this deployment's responsibility). Duplicate paths are de-duped. The agents.txt spec does not mandate these headers, but the CORS line is load-bearing for any browser-context A2A client probing cross-origin.

`authorization.protocols: ['agent-auth']` is *not* auto-emitted. The agent-auth `/.well-known/agent-configuration` endpoint is conventionally served by a dynamic handler (a worker or route function) that sets response headers in code. `_headers` and `vercel.json#headers` apply only to static files; emitting an entry there would be silently ignored at request time. If the implementer serves the agent-configuration document as a static file (unusual), add the entry manually with the same shape as `/agents.json`.

### Static file vs dynamic handler

The headers config file applies only to static files on the hosting platform's asset pipeline. It does not apply to dynamic routes served by a handler or worker.

| Scenario | Where the headers come from |
|---|---|
| File exists on disk in `--out` after build (e.g. `public/agents.json`, `public/.well-known/agent-card.json`) | `_headers` / `vercel.json#headers` |
| URL responds without a file on disk (route handler, middleware, worker) | The handler must set headers in code before responding |

Quick test: run the build, then `ls` the output. If you can see the file, headers config applies. If the URL works but the file is absent, you are serving dynamically and the handler is responsible. `@herald/addon` handles this for the routes it owns. If a developer hand-rolls a route handler for `/agents.txt`, they must set `Content-Type: text/plain; charset=utf-8`, `Access-Control-Allow-Origin: *`, and `Cache-Control: public, max-age=3600` themselves.

### §4.5 Headers — dev-server parity (`@herald/addon/dev`)

Production hosts apply the generated `_headers` / `vercel.json` at the edge. Most dev servers do not, which means `audit_site http://localhost:…` reports §4.5 fails that the same site does not exhibit in production. CORS is the half that actually breaks: browser-context agent clients cannot fetch `/agents.txt` or `/agents.json` cross-origin on `localhost` without `Access-Control-Allow-Origin: *`.

`@herald/addon/dev` is a sub-path that exports framework-specific shims. Each reads the generated headers file at request time and replays the rules on dev-server responses. The CLI prints the right snippet under `Dev parity (detected: <framework>)` after every `herald generate --headers`, sourced from the project probe.

| Framework probe value | Shim | Wire it in |
|---|---|---|
| `astro` | `heraldHeadersVitePlugin()` | `astro.config.mjs` `vite.plugins[]` |
| `astro` / `sveltekit` / Vite-based generally | `heraldHeadersVitePlugin()` | `vite.config.ts` `plugins[]` |
| `express` | `heraldHeadersConnect()` | `app.use(heraldHeadersConnect())` before routes |
| `hono` | `heraldHeadersHono()` | `app.use('*', heraldHeadersHono())` |
| `nextjs` | None — use `next.config.js` `async headers()` (native API, works in both dev and prod) | n/a |
| `unknown` | One of the three above, depending on the dev server | Generic guide printed by the CLI |

Shared options across all three shims:

| Option | Default | Meaning |
|---|---|---|
| `headersFile` | `./public/_headers` | Cloudflare / Netlify headers file path (relative to `cwd`) |
| `vercelJson` | `./vercel.json` | Fallback when `headersFile` is not present |
| `cwd` | `process.cwd()` | Project root for relative-path resolution |
| `silent` | `false` | Suppress the one-shot "no headers file found" warning |

The shims re-read the headers file on each request (cheap, dev-only), so `herald generate --headers` regenerations show up live without a dev-server restart. The Vite plugin is `apply: 'serve'`, so it has no effect during build. Production bundles never pull in `@herald/addon/dev` because no production entry point imports from it.

If `loadDevHeaderRules()` finds neither `_headers` nor `vercel.json`, the shim emits a one-shot `console.warn` reminding the developer to run `herald generate --headers`. Pass `silent: true` to suppress that warning (useful in test setups where the project is intentionally headers-free).

For Next.js specifically: the framework already supports `async headers()` in `next.config.js`, which applies in both `next dev` and production. Herald does not ship a Next.js dev shim because the native API already covers both surfaces. Mirror the rules from `_headers` into `next.config.js` if you also need them on Node-runtime routes; the Vercel `vercel.json#headers` file (emitted by `herald generate --headers --platform vercel`) still applies at the edge for Vercel deployments.

### §4.5 Headers — manual config for unsupported platforms

For nginx, Apache, Caddy, AWS S3+CloudFront, etc., the headers must be set in the platform's own configuration. Required values are the same:

```
/agents.txt  : Content-Type: text/plain; charset=utf-8 + ACAO: * + Cache-Control: public, max-age=3600
/agents.json : Content-Type: application/json + ACAO: * + Cache-Control: public, max-age=3600
```

Mirror the `/agents.json` shape for any additional same-origin static AgentCards declared in `a2a.cards`.

---

## Package Sub-paths

```bash
npm install @herald/addon

# Sub-path imports — only pull in what you use:
@herald/addon            → core utils + x402 utils + MPP utils + payment-gate (no framework)
@herald/addon/express    → Express adapter   (peer: express)
@herald/addon/hono       → Hono adapter      (peer: hono)
@herald/addon/nextjs     → Next.js adapter   (peer: next)
@herald/addon/dev        → Dev-server §4.5 headers shim (Vite plugin, Connect middleware, Hono middleware). Reads `public/_headers` (or `vercel.json` as fallback) at request time so localhost honors the same rules production does.

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

## `@herald/core` Key Exports

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

// Protocol registry (single source of truth for identifiers)
PAYMENT_PROTOCOLS                       // readonly ['x402', 'mpp']
AUTH_PROTOCOLS                          // readonly ['agent-auth']
MPP_METHODS                             // readonly ['tempo', 'stripe']
isExperimentalIdentifier(value)         // value.startsWith('x-') && value.length > 2
isKnownPaymentProtocol(value)           // boolean
isKnownAuthProtocol(value)              // boolean
isAcceptedPaymentIdentifier(value)      // registered OR x- prefixed
isAcceptedAuthIdentifier(value)         // registered OR x- prefixed

// Types
type PaymentProtocolId = 'x402' | 'mpp' | `x-${string}`
type AuthProtocolId    = 'agent-auth'  | `x-${string}`
```

Zero runtime dependencies, safe on Node.js, edge runtimes, Deno, Bun.

---

## Adding a New Protocol

Two paths based on stability.

### Path 1: experimental, no herald changes (`x-` prefix)

For protocols not yet in the registry, advertise them with an `x-` prefix in the user's config. Per agents.txt spec §3.1, parsers must accept these and validators must not warn.

```js
payments: {
  protocols: ['x402', 'x-mypay'],   // 'x-mypay' is your experimental identifier
  x402: { treasury: { evmAddress: process.env.EVM_ADDRESS } },
}
```

Emission:

- `agents.txt`: `Protocols: x402, x-mypay`
- `agents.json`: `"payments": { "x402": { ... }, "x-mypay": {} }`

The empty object is the support signal. The structured shape of an experimental protocol's per-protocol block in `agents.json` is the protocol author's responsibility; herald does not enforce one. The gate middleware ignores `x-` identifiers; the user runs their own protocol handler.

No herald edits required.

### Path 2: register the protocol in herald

When the protocol is stable and you want generators, validators, the wizard, and (for payments) the gate to know about it:

1. **`packages/core/src/protocols.ts`**: append the identifier to `PAYMENT_PROTOCOLS` or `AUTH_PROTOCOLS`. One edit; validators and the CLI Zod schema follow.
2. **`packages/core/src/types.ts`**: add an interface for the protocol's config block if it has one (mirror `X402Config` / `MppConfig`). Hang it under `PaymentConfig` (or `AuthorizationConfig`) with the same key as the identifier.
3. **`packages/core/src/payments.ts`** (payments only): add `isXyzActive(payments)` and a branch in `resolveActiveProtocols`. The honest-declarations rule says the block is emitted only when the protocol can actually run.
4. **`packages/core/src/agents-txt.ts`** + **`agents-json.ts`**: the `Protocols:` line and the per-protocol object follow from `resolveActiveProtocols`, so payment protocols pick those up automatically. If the protocol carries structured fields in `agents.json`, add a per-protocol emitter inside `generateAgentsJson` next to the x402 and MPP blocks.
5. **`packages/web/src/payment-gate.ts`** (payments only, optional): add a credential check before the existing protocol checks, and a challenge emitter in the unauthenticated 402 path. The gate is the only place protocol routing lives; adapters never re-implement it.
6. **`packages/cli/src/commands/init.ts`** (optional): add a prompt step inside the payments block if the protocol needs credentials at init.
7. **Tests**: cases under `packages/core/src/__tests__/{agents-txt,agents-json}.test.ts`.

For a brand-new block kind (not payment, not auth, not MCP, not Skills, not A2A), the A2A diff is the most recent worked example: a new `XyzConfig` interface in `types.ts`, an `Xyz:` line emitter in `agents-txt.ts`, an `xyz[]` array emitter in `agents-json.ts`, validator rules in `validate.ts`, a Zod schema entry in `config-schema.ts`, and a wizard prompt.

### Decision

When a user mentions a protocol not currently in the registry, default to Path 1. Suggest Path 2 only when the protocol has clearly settled and the user wants herald-level support.
