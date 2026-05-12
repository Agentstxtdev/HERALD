# HERALD: Codebase Guide

This document explains the architecture of the `herald` monorepo: what each package does, how the pieces fit together, and where to make changes when extending the system.

---

## What this project is

A framework that makes any website readable and (optionally) monetizable by AI agents. It generates the discovery files of the agent-readiness stack from a single config object and ships an opt-in payment middleware on top:

| Standard | File / surface | Purpose |
|---|---|---|
| RFC 9309 | `robots.txt` | AI crawler access control |
| sitemaps.org 0.9 | `sitemap.xml` | Page inventory |
| llmstxt.org | `llms.txt` (+ optional `llms-full.txt`) | LLM-optimized site index |
| `agents.txt` standard | `agents.txt` | Agent capabilities declaration (plain text) |
| `agents.txt` standard | `agents.json` | Agent capabilities catalog (structured JSON companion) |
| x402 v2 (own implementation) + MPP via `mppx` | HTTP 402 | Optional agent micropayments (crypto + fiat) |

The `agents.txt` standard is defined and maintained outside this repository; herald is an implementation of it. Anyone may write a different implementation; herald exists to make adoption trivial in JavaScript-/TypeScript-flavored projects.

---

## Monorepo layout

```
herald/
├── packages/
│   ├── core/          — shared types + pure generators (no framework deps)
│   ├── web/           — Express / Hono / Next.js adapters + payment middleware
│   └── cli/           — @herald/cli
├── examples/
│   ├── express/       — working Express server
│   └── nextjs/        — working Next.js App Router app
├── docs/              — engineering decisions and changelog entries
├── skills/            — agent-installable skill packages (e.g. agents-txt-setup)
├── ref/               — third-party protocol references for development (mppx, x402, machine-payments)
└── tsconfig.base.json — shared TypeScript config (ES2022, NodeNext, strict)
```

All packages are ESM (`"type": "module"`). TypeScript uses `NodeNext` module resolution throughout. pnpm workspaces link packages together via `workspace:*` references.

---

## Package: `@herald/core`

**No framework dependencies. Pure functions only.**

```
packages/core/src/
├── types.ts        — all shared TypeScript interfaces (incl. ContentDriver, HostingPlatform)
├── robots.ts       — generateRobotsTxt()
├── llms.ts         — generateLlmsTxt(), generateLlmsFullTxt()
├── sitemap.ts      — sitemap parser + generator + Firecrawl driver + ContentDriver factories
├── agents-txt.ts   — generateAgentsTxt()
├── agents-json.ts  — generateAgentsJson()
├── headers.ts      — generateHeadersFile(platform), mergeVercelHeaders(), headersDeploymentNote()
├── validate.ts     — validateRobotsTxt(), validateLlmsTxt(), validateAgentsTxt(), validateAgentsJson()
└── index.ts        — re-exports everything
```

### Generators and what they produce

Each generator is a pure function: takes `AgenticConfig`, returns a string. No I/O, no side effects.

| Generator | Output | What it adds over the previous layer |
|-----------|--------|--------------------------------------|
| `generateRobotsTxt()` | `robots.txt` | AI crawler rules, `Sitemap:` + `Content-Signal:` directives, `Allow: /agents.txt` exposes the spec file at its canonical path |
| `generateLlmsTxt()` | `llms.txt` | Curated page index for LLM inference (requires content driver) |
| `generateLlmsFullTxt()` | `llms-full.txt` | Long-form companion: inlines page content under each heading (Firecrawl source recommended) |
| `generateAgentsTxt()` | `agents.txt` | Plain-text capabilities declaration (payments, auth, MCP, skills, A2A) |
| `generateAgentsJson()` | `agents.json` | Structured JSON catalog: same config, richer per-block detail |
| `generateSitemapXml()` | `sitemap.xml` | sitemaps.org 0.9 `<urlset>` from a `PageEntry[]` (XML-escaped, deduped) |
| `generateHeadersFile(platform)` | `_headers` (Cloudflare/Netlify) or `vercel.json` (Vercel) | Platform-specific config carrying the spec §4.5 response headers (`Content-Type` with charset, `Access-Control-Allow-Origin: *`, `Cache-Control`). For Vercel, returns a JSON snippet the CLI merges with any existing `vercel.json`. |

**`agents-json.ts`: the structured catalog**

`generateAgentsJson` produces the same information as `agents.txt` but in structured JSON with additions that agents cannot derive from the plain-text format alone:

- `payments.pricing`: default price upfront so agents can pre-screen affordability before hitting a gated route. Uses `amount` (decimal string) and `token` (e.g. `'USDC'` / `'USD'`). Wallet/treasury addresses are deliberately excluded; they stay in `402` responses only.
- `payments.x402.chains`: CAIP-2 chain IDs so agents know if they support the chain before attempting payment. Presence of the `payments.x402` object is itself the x402 support signal.
- `payments.mpp.methods`: array of configured MPP method identifiers (`'tempo'`, `'stripe'`) so an agent without a Tempo wallet learns from this field that Stripe is available without first hitting the `WWW-Authenticate: Payment` challenge. The challenge remains the authoritative source for per-method parameters (network identifiers, recipient identifiers, currency codes). Presence of the `payments.mpp` object is itself the MPP support signal.
- `payments.required` (optional boolean): site-level policy hint. When `true`, every interaction with the site requires payment and there is no free path. Symmetric with `authorization.identity: "required"`.
- **No top-level `payments.protocols` array.** The set of supported protocols is `keys(payments) intersect {x402, mpp}`. `agents.txt` carries the same set as the `Protocols:` directive because plain text needs a directive name; the `audit_site` cross-file check validates that the two encodings agree.
- `authorization.discovery`: always `"/.well-known/agent-configuration"`. Hardcoded so agents don't need to know the agent-auth spec path.
- `mcp[].type`: always `"streamable-http"` for HTTP MCP endpoints. Hardcoded by the generator (MCP spec 2025-03-26+).

The version field in the JSON output (`"1.0"`) tracks the spec version, not a semver; agents use it to identify the schema generation.

**Security invariant (both files):** Never output wallet addresses, API keys, JWKs, Stripe secret keys, or any credentials. `agents.txt` and `agents.json` are public discovery artifacts served without authentication.

### The config object

Everything flows from a single `AgenticConfig` object defined in `types.ts`. Every generator and middleware accepts this type.

```ts
interface AgenticConfig {
  site:           SiteConfig           // name, url, description
  content?:       ContentConfig        // how to discover pages (driver)
  crawlers?:      CrawlerConfig        // which bots to block/allow
  payments?:      PaymentConfig        // x402 + MPP config
  authorization?: AuthorizationConfig  // agent-auth protocol
  mcp?:           McpConfig            // MCP server endpoint URLs
  skills?:        SkillsConfig         // skill package URLs (agentskills.io)
  a2a?:           A2AConfig            // A2A AgentCard URLs (a2a-protocol.org)
}
```

### Content drivers (`types.ts` → `llms.ts` → `sitemap.ts`)

The `content.driver` field is a discriminated union that controls how `generateLlmsTxt` resolves pages:

```ts
type LlmsDriver =
  | { type: 'sitemap';   sitemapUrl: string }
  | {
      type: 'firecrawl'
      siteUrl: string
      apiKey: string
      limit?: number                           // v2 default 5000, max 100000
      search?: string                          // relevance ordering
      sitemap?: 'include' | 'skip' | 'only'    // default 'include'
      includeSubdomains?: boolean              // default true
      ignoreQueryParameters?: boolean          // default true
    }
  | { type: 'static';    pages: PageEntry[]; sections?: ContentSection[] }
  | { type: 'manual';    sections: ContentSection[] }
```

`resolveContent()` in `llms.ts` switches on this union and calls the appropriate function in `sitemap.ts`. The result is a `ContentSection[]` that gets rendered into the `## Section` blocks of `llms.txt`.

The `firecrawl` variant calls `crawlWithFirecrawl(opts)` against [`/v2/map`](https://docs.firecrawl.dev/api-reference/endpoint/map). One API call per generation: the response includes `title` and `description` per URL, so no per-page scraping is needed to populate llms.txt entries.

Alternatively, pass a `ContentDriver` directly as the second argument to `generateLlmsTxt(config, driver)`. `ContentDriver` is an interface (`{ resolve(): Promise<ContentSection[]> }`) with four pre-built factories exported from `sitemap.ts`: `sitemapDriver(sitemapUrl)`, `firecrawlDriver(opts)`, `staticDriver(pages, sections?)`, `manualDriver(sections)`. This is the seam for tests; pass `staticDriver(pages)` to exercise the full generator without network calls.

#### llms-full.txt

```ts
interface ContentConfig {
  driver: LlmsDriver
  fullTxt?: { driver: LlmsDriver }   // optional override — same list as `driver` if omitted
}
```

The `llms-full.txt` filename is community convention; the formal spec names the expanded forms `llms-ctx.txt` / `llms-ctx-full.txt` (produced by the `llms_txt2ctx` CLI). We emit at `/llms-full.txt` because that's what agents look for. The mechanism (inlining page markdown under each heading) matches the spec's "expanded link" definition.

`content.fullTxt.driver` is purely a config knob: it lets the expanded file be built from a different URL list than `llms.txt`. Cross-domain sources are not prohibited by the spec (verified against [llmstxt.org/domains.html](https://llmstxt.org/domains.html), which contains no rules about origins), so pointing `fullTxt.driver` at a docs subdomain or unrelated origin is spec-compatible.

`generateLlmsFullTxt(config, driver?)` resolves its source in this order: explicit `driver` arg → `config.content.fullTxt.driver` → `config.content.driver`. When the resolved source is a `firecrawl` driver, the generator calls `scrapeMarkdownWithFirecrawl(url, apiKey)` for each page (5 concurrent, [`/v2/scrape`](https://docs.firecrawl.dev/api-reference/endpoint/scrape), `formats: ['markdown']`, `onlyMainContent: true`) and inlines the markdown under `### [title](url)` headings. Other source types (sitemap/static/manual) get a link-list output without inlined content because core has zero runtime dependencies and an HTML→markdown converter would break that. Omit `content.fullTxt` to skip llms-full.txt generation entirely (CLI behaviour: writes the file only when the block is present).

### Payment types (`types.ts`)

Two payment protocols are modelled separately and cleanly:

```ts
interface PaymentConfig {
  protocols?:        PaymentProtocolId[]   // 'x402' | 'mpp' | `x-${string}` (registry plus experimental)
  required?:         boolean       // site-level policy: emits Payments: required + payments.required
  x402?:             X402Config    // crypto micropayments
  mpp?:              MppConfig     // Stripe/Tempo session payments
  exemptUserAgents?: string[]
}

interface X402Config {
  treasury: {
    evmAddress?:    string    // 0x... for EVM chains
    evmChains?:     string[]  // CAIP-2 IDs e.g. ['eip155:8453']
    solanaAddress?: string    // base58 for Solana
    solanaNetwork?: 'mainnet-beta' | 'devnet'
  }
  pricing?: PricingConfig      // { amount: '0.001', token: 'USDC' }
  perPath?: Record<string, PricingConfig>  // per-route price overrides
}

interface MppConfig {
  secretKey?:                string   // HMAC key for challenge binding (env: MPP_SECRET_KEY)
  realm?:                    string   // WWW-Authenticate realm (default: site.name)
  tempoEnabled?:             boolean  // USDC on Tempo chain (default: true when tempoRecipient set)
  tempoRecipient?:           string   // 0x... wallet — required to activate Tempo payments
  tempoCurrency?:            string   // token contract (default: USDC.e on Tempo mainnet)
  tempoTestnet?:             boolean
  stripeEnabled?:            boolean
  stripeSecretKey?:          string   // sk_... — enables fiat cards
  stripeNetworkId?:          string   // Stripe Business Network ID — required to activate Stripe
  stripeCurrency?:           string   // ISO 4217 (default: 'usd')
  stripePaymentMethodTypes?: string[] // (default: ['card', 'link'])
  pricing?:                  PricingConfig
  perPath?:                  Record<string, PricingConfig>
  description?:              string   // shown to agents in the 402 challenge
}
```

Four further config types cover the newer capability blocks:

```ts
interface AuthorizationConfig {
  enabled:           boolean
  protocols?:        AuthProtocolId[]   // 'agent-auth' | `x-${string}` (registry plus experimental)
  identityRequired?: boolean    // emits Identity: required / identity: "required"
}

interface McpEndpoint  { url: string; description?: string }
interface SkillEntry   { url: string; description?: string }
interface A2AEntry     { url: string; description?: string }

interface McpConfig {
  // string for URL-only; object adds a description that surfaces in agents.json
  endpoints: string | McpEndpoint | (string | McpEndpoint)[]
}

interface SkillsConfig {
  urls: string | SkillEntry | (string | SkillEntry)[]
}

interface A2AConfig {
  // One or more A2A AgentCard URLs (a2a-protocol.org). The well-known path
  // /.well-known/agent-card.json suffices for a single agent at the canonical
  // location; this block covers multi-agent sites and non-canonical paths.
  cards: string | A2AEntry | (string | A2AEntry)[]
}
```

`AuthorizationConfig`, `McpConfig`, `SkillsConfig`, and `A2AConfig` are independent of each other and of `PaymentConfig`. Each block in the generated files is omitted entirely when its config field is absent.

### The protocol registry (`packages/core/src/protocols.ts`)

A single module is the source of truth for every protocol identifier the package recognises. The generators, validators, payment activity checks, and the CLI Zod schema all read from it.

```ts
export const PAYMENT_PROTOCOLS = ['x402', 'mpp'] as const
export const AUTH_PROTOCOLS    = ['agent-auth'] as const
export const MPP_METHODS       = ['tempo', 'stripe'] as const

export type PaymentProtocolId = (typeof PAYMENT_PROTOCOLS)[number] | `x-${string}`
export type AuthProtocolId    = (typeof AUTH_PROTOCOLS)[number]    | `x-${string}`

export function isExperimentalIdentifier(v: string): boolean        // v.startsWith('x-') && v.length > 2
export function isAcceptedPaymentIdentifier(v: string): boolean     // registered OR x- prefixed
export function isAcceptedAuthIdentifier(v: string): boolean        // registered OR x- prefixed
```

The `x-` prefix matches the agents.txt spec §3.1 convention for experimental identifiers. Parsers must accept them, validators must not warn on them, and the generator passes them through to `agents.txt` and `agents.json` verbatim. The empty per-protocol object in `agents.json` (`payments['x-mypay']: {}`) is the support signal; the structured shape of the experimental block is the protocol author's responsibility.

Adding a registered protocol is now a one-file edit: append to `PAYMENT_PROTOCOLS` or `AUTH_PROTOCOLS`. The full recipe is in [the README](README.md#adding-a-new-protocol). For payment protocols you also wire an activity check in `payments.ts` and (if the protocol carries structured fields) a per-protocol emitter in `agents-json.ts` alongside the existing x402 and MPP blocks. For a brand-new block kind, the A2A diff is the most recent worked example: a new `A2AConfig` type, an `A2A:` line emitter in `agents-txt.ts`, an `a2a[]` array emitter in `agents-json.ts`, parser awareness in any tool that reads agents.txt, and a wizard prompt in the CLI.

---

## Package: `@herald/addon`

**Framework adapters and payment middleware. All framework packages are optional peer dependencies.**

```
packages/web/src/
├── x402.ts          — x402 v2 protocol helpers: buildAccepts(), settleX402(), header coding
├── mpp.ts           — mppx runtime: createMppxRuntime() + per-request Mppx.compose()
├── payment-gate.ts  — gateRequest(): the framework-neutral fetch-style decision logic
├── express.ts       — Express adapter (≈100 lines — converts req → fetch Request)
├── hono.ts          — Hono adapter
├── nextjs.ts        — Next.js App Router adapter
└── index.ts         — re-exports core + x402 + mpp + payment-gate (not adapters)
```

The package exports sub-paths so users only pull in what they use:

```
@herald/addon           → core + x402 utils + mpp utils + payment-gate
@herald/addon/express   → express.ts (requires: express)
@herald/addon/hono      → hono.ts    (requires: hono)
@herald/addon/nextjs    → nextjs.ts  (requires: next)
```

`mppx` and `stripe` are optional peer deps regardless of framework.

### `x402.ts`: direct v2 protocol implementation

We implement x402 v2 ourselves against the public facilitator at
`https://x402.org/facilitator` rather than depending on the `@x402/*` SDK
family. This keeps the framework adapters thin and avoids tying us to v1↔v2
SDK migrations.

```
AgenticConfig.payments.x402
        │
        ▼
  buildAccepts(x402Cfg, pricing)            → PaymentRequirements[]
        │                                      (atomic units, CAIP-2 networks, USDC asset addresses)
        ▼
  buildPaymentRequired({ resourceUrl, accepts, ... })   → 402 body
        │
        ▼
  decodePaymentSignature(header)            → PaymentPayload | null
        │
        ▼
  matchAccepts(payload, accepts)            → PaymentRequirements
        │
        ▼
  settleX402({ paymentPayload, paymentRequirements }) → SettlementResponse
        │
        ▼
  encodePaymentResponse(settlement)         → base64 → PAYMENT-RESPONSE header
```

USDC contract addresses default per-network for Base (eip155:8453), Base Sepolia
(eip155:84532), Ethereum (eip155:1), Solana mainnet, and Solana devnet. Override
via `x402.assets[network] = '<contract>'` for non-USDC tokens or other chains.

Wire summary (v2):
- Out: 402 with body containing `x402Version: 2`, `accepts[]`, `resource`
- In: `PAYMENT-SIGNATURE: <base64 PaymentPayload>` (also accepts legacy `X-Payment` for v1 clients)
- Out (verified): `PAYMENT-RESPONSE: <base64 SettlementResponse>` attached to the 200 response

### `mpp.ts`: Machine Payments Protocol via mppx

MPP (IETF `draft-ryan-httpauth-payment`) uses a challenge/credential flow.
`createMppxRuntime(mppConfig, realm)` loads `mppx/server` dynamically, builds
`Mppx.create({ methods: [tempo.charge(...), stripe.charge(...)], secretKey, realm })`
once, and returns `{ ready, charge(request, { tempoAmount, stripeAmount, description }) }`.

The runtime's `.charge()` rebuilds `Mppx.compose(...)` per request so both Tempo
and Stripe are presented in a single 402 (the agent picks one). Pricing is
converted per method: Tempo = `decimals` from `pricing` (default 6 for USDC),
Stripe = always 2 (currency-minor units like cents).

If `mppx` is not installed → `ready: false`, MPP path is skipped, x402 still
serves the 402 alone.

### `payment-gate.ts`: the shared decision

`gateRequest(request: Request, opts: { config, pathPrefix }): Promise<GateResult>`
is the *only* place the protocol decision lives. Result variants:

```ts
type GateResult =
  | { kind: 'pass' }                                       // exempt UA or payments disabled
  | { kind: 'pass-with-headers'; headers: Record<string, string> }  // verified — attach PAYMENT-RESPONSE / Payment-Receipt
  | { kind: 'respond'; response: Response }                // 402 challenge or hard reject
```

Decision order:

```
1. Exempt UA → 'pass'
2. Authorization: Payment …  + MPP configured → mppx.charge(request) (Mppx.compose)
   - status 402 → 'respond' with the fresh challenge
   - withReceipt   → 'pass-with-headers' with the `Payment-Receipt`
3. PAYMENT-SIGNATURE / X-Payment + x402 configured → settle via facilitator
   - failure → 'respond' with 402
   - success → 'pass-with-headers' with `PAYMENT-RESPONSE`
4. No credential → 'respond' with a single 402 carrying both
   x402 accepts[] (body) and MPP WWW-Authenticate (header)
```

The runtime is cached in a `WeakMap` keyed by `AgenticConfig` so `Mppx.create`
only fires once per config; never per request.

### Framework adapters

All three adapters do the same three things and nothing else:

1. Convert their framework's request → Web `Request`
2. `await gateRequest(request, { config, pathPrefix })`
3. Translate the result back: `pass` → call next; `pass-with-headers` → call next + attach headers; `respond` → write the `Response`

**Express** (`express.ts`):

```ts
app.use(createAgenticRouter(config))                       // robots.txt, llms.txt, agents.txt, agents.json
app.use('/api', agenticPaymentMiddleware(config, '/api'))  // → gateRequest()
```

**Hono** (`hono.ts`):

```ts
createAgenticRoutes(app, config)
app.use('/api/*', agenticPaymentMiddleware(config, '/api'))
```

**Next.js** (`nextjs.ts`):

```ts
// middleware.ts — Edge Middleware payment proxy
export default createPaymentProxy(config, '/api')

// App Router route handlers for discovery files
export const GET = robotsTxtHandler(config)    // app/robots.txt/route.ts
export const GET = llmsTxtHandler(config)      // app/llms.txt/route.ts
export const GET = agentsTxtHandler(config)    // app/agents.txt/route.ts
export const GET = agentsJsonHandler(config)   // app/agents.json/route.ts
```

There is no per-framework x402 SDK to wire; everything happens inside
`gateRequest()`.

---

## Package: `@herald/cli`

```
packages/cli/src/
├── cli.ts               — Commander.js entry point (three commands)
├── project-probe.ts     — detectProject(): pure filesystem reads, no prompting
├── config-writer.ts     — buildAgenticConfigContent() + writeAgenticConfig() + s()
├── config-schema.ts     — Zod v4 schema for AgenticConfig (CLI-only, keeps core dep-free)
└── commands/
    ├── init.ts          — interactive wizard (orchestrates probe + writer)
    ├── generate.ts      — Zod-validates config, writes + spec-checks robots/llms/sitemap/agents-txt/agents-json
    └── check.ts         — fetches a live site and validates compliance
```

### `init` command

Orchestrates three concerns that are now separated into distinct modules:
1. **`project-probe.ts`**: `detectProject()` reads `package.json`, scans common paths for `sitemap.xml`, reads `.env` files for wallet addresses and API keys, and detects the hosting platform (`hostingPlatform: 'cloudflare' | 'netlify' | 'vercel' | 'unknown'`) from file presence (`wrangler.json`/`wrangler.toml`/`netlify.toml`/`vercel.json`/`.vercel/`) with a dep-based fallback (`@astrojs/cloudflare`, `@cloudflare/workers-types`, `wrangler`, `@netlify/plugin-*`). Pure reads, no side effects.
2. **`commands/init.ts`**: readline wizard that prompts the user and assembles an `AgenticConfigChoices` object from answers.
3. **`config-writer.ts`**: `buildAgenticConfigContent(choices)` converts structured choices into the `agentsjson.config.js` string; `writeAgenticConfig(path, choices)` writes it. The `s()` helper (JSON.stringify-based injection prevention) lives here.

The `-y` flag skips all prompts and uses detected defaults.

### `generate` command

Loads `agentsjson.config.js` via dynamic `import()`, then immediately validates it through `AgenticConfigSchema` (Zod v4, `config-schema.ts`). Structural errors (missing site, wrong type, refine violations) are reported with field-level paths before any file is written:

```
❌ Failed to load config: Invalid agentsjson.config.js:
  • site.url: must be a valid URL e.g. https://mysite.com
  • payments.x402: treasury must include at least one of evmAddress or solanaAddress (after lenient validation)
```

**Per-field lenient validation for wallet env vars.** The format checks for `evmAddress` (40-char `0x` hex), `solanaAddress` (32-char base58 minimum), and `stripeSecretKey` (`sk_` prefix) are still strict, but each uses `.catch()` so a malformed *optional* field warns and is treated as `undefined` rather than aborting the whole parse. A typo in `EVM_ADDRESS` no longer blocks the Solana side of a Solana-only deployment. The `TreasuryConfigSchema.refine` rule runs after the lenient pass; if every wallet is dropped, x402 still fails because a treasury with no recipient is meaningless. Warning shape:

```
herald: ignoring malformed evmAddress (...); set EVM_ADDRESS to a valid 0x[40 hex] value or unset to skip EVM.
```

On success, calls the generators from `@herald/core`, writes files to `--out` (default `./public`), then runs the spec compliance validators (`validateRobotsTxt`, `validateLlmsTxt`, `validateAgentsTxt`, `validateAgentsJson` from core) and prints any warnings inline.

Per-file flags come in two symmetric sets. The default mode emits everything applicable to the config; pass any positive selector and the output set narrows to those flags only; any `--skip-*` flag subtracts from whichever set is selected. Resolution rules live in `packages/cli/src/commands/generate.ts → resolveOutputs()`.

Positive selectors (emit only these):
- `--robots`: emit robots.txt
- `--llms`: emit llms.txt
- `--llms-full`: emit llms-full.txt (requires `content.fullTxt` in config)
- `--agents`: emit agents.txt + agents.json (paired)
- `--sitemap`: emit sitemap.xml (also forces emission for the `firecrawl` driver; warns + skips for the `sitemap` driver since reading what we'd overwrite is circular)
- `--headers`: emit the §4.5 headers config for the detected platform. Cloudflare/Netlify get `_headers` in `--out`; Vercel gets `vercel.json` at the project root with merge semantics (existing entries with a different `source` are preserved verbatim, the `/agents.txt` and `/agents.json` sources are replaced). Pass `--platform <cloudflare|netlify|vercel|unknown>` to override the probe.

Negative selectors (subtract from the selected set):
- `--skip-robots`: skip robots.txt (useful when your framework or CDN owns it)
- `--skip-llms`: skip llms.txt (useful when Firecrawl is run separately or is too slow for CI)
- `--skip-llms-full`: skip llms-full.txt (keep llms.txt; useful when you only want to refresh the index without re-running the Firecrawl scrape)
- `--skip-agents`: skip agents.txt + agents.json (treat HERALD as a robots.txt + llms.txt tool only)
- `--skip-sitemap`: never emit sitemap.xml (use when your framework already emits one)
- `--skip-headers`: skip the §4.5 headers config (use when your platform isn't auto-generated for and you've configured headers elsewhere — nginx, Apache, Caddy, S3+CloudFront, programmatic handler in `@herald/addon`, etc.)

**sitemap.xml emission policy:** default behavior depends on `content.driver`:

| Driver | Default | Resolution path |
|---|---|---|
| `static` | emit | `driver.pages` ∪ `driver.sections[].pages` |
| `manual` | emit | `driver.sections[].pages` |
| `firecrawl` | skip | `crawlWithFirecrawl()` (only when `--sitemap` is passed explicitly) |
| `sitemap` | skip | circular, already exists at the configured URL |

Pages are deduplicated by URL and XML-escaped before serialization in `generateSitemapXml`.

### `check` command

Fetches `robots.txt`, `llms.txt`, `agents.txt`, `agents.json`, and `sitemap.xml` from a live URL and scores the site using the same `validateRobotsTxt`, `validateLlmsTxt`, `validateAgentsTxt`, and `validateAgentsJson` functions from `@herald/core` that `generate` uses, not ad-hoc string matching.

---

## How payments flow end-to-end

### x402 v2 (crypto, per-request)

```
Agent                                      Server (gateRequest)              x402.org facilitator
  │                                              │                                   │
  ├── GET /api/content (no header) ─────────────►│                                   │
  │                                              │ buildAccepts() + 402 body         │
  │◄── 402 { x402Version: 2, accepts: [...] } ───┤                                   │
  │                                              │                                   │
  │  [agent signs EIP-3009 / SVM payload]        │                                   │
  │                                              │                                   │
  ├── GET /api/content ─────────────────────────►│                                   │
  │   PAYMENT-SIGNATURE: <base64 PaymentPayload> │                                   │
  │                                              ├── POST /settle ──────────────────►│
  │                                              │      (paymentPayload +            │
  │                                              │       paymentRequirements)        │
  │                                              │◄── { success, transaction, ... } ─┤
  │◄── 200 + PAYMENT-RESPONSE ───────────────────┤                                   │
```

Verification + on-chain settlement are handled entirely by the public
facilitator at `https://x402.org/facilitator` (free, no API key). Override via
`x402.facilitatorUrl` when you run your own.

### MPP (fiat + stablecoin, session-based)

```
Agent                                      Server (gateRequest)              mppx (Tempo + Stripe)
  │                                              │                                   │
  ├── GET /api/content (no auth) ───────────────►│                                   │
  │                                              ├── Mppx.compose(tempo, stripe) ───►│
  │                                              │                                   ├─► 402 + WWW-Authenticate
  │◄── 402 + WWW-Authenticate + accepts[] ───────┤◄──────────────────────────────────┤
  │                                              │  (single 402 carries both         │
  │                                              │   x402 accepts AND MPP challenge) │
  │                                              │                                   │
  │  [agent authorizes via Stripe / Tempo]       │                                   │
  │                                              │                                   │
  ├── GET /api/content ─────────────────────────►│                                   │
  │   Authorization: Payment <credential>        ├── Mppx.compose(...)(request) ────►│
  │                                              │                                   ├─► verify + Payment-Receipt
  │◄── 200 + Payment-Receipt ────────────────────┤◄──────────────────────────────────┤
```

---

## Adding a new framework adapter

You don't need to know about x402 or mppx at all; adapters are pure
request/response shape conversion. Mirror `express.ts`:

```ts
import { gateRequest } from './payment-gate.js'

export function agenticPaymentMiddleware(config: AgenticConfig, pathPrefix = '') {
  if (!config.payments?.enabled) return passThroughMiddleware

  return async (frameworkReq, frameworkRes, next) => {
    const request = toFetchRequest(frameworkReq)               // your conversion
    const result = await gateRequest(request, { config, pathPrefix })

    if (result.kind === 'pass') return next()
    if (result.kind === 'pass-with-headers') {
      for (const [k, v] of Object.entries(result.headers)) frameworkRes.setHeader(k, v)
      return next()
    }
    // 'respond' — write the Response back to the framework
    writeResponse(frameworkRes, result.response)               // your conversion
  }
}
```

The framework runtime is the only new peer dep; `mppx` and `stripe` already
cover payments (added to peer deps when first introduced).

Then add the sub-path export to `packages/web/package.json`:

```json
"./<framework>": {
  "import": "./dist/<framework>.js",
  "types":  "./dist/<framework>.d.ts"
}
```

---

## Adding a new content driver

All drivers implement the same interface: `{ resolve(): Promise<ContentSection[]> }`. The steps below wire a new driver all the way from the interface through to the config file and CLI auto-detection. Stop at whatever layer you need.

**1. Implement `ContentDriver`**: the contract everything else builds on:

```ts
// packages/core/src/sitemap.ts
export function myDriver(opts: MyDriverOpts): ContentDriver {
  return {
    resolve: async () => {
      const pages = await fetchPages(opts)   // returns PageEntry[]
      return groupPagesByPath(pages)         // returns ContentSection[]
    },
  }
}
```

**2. Add to the `LlmsDriver` union** (`packages/core/src/types.ts`) so users can declare it in `agentsjson.config.js`:

```ts
type LlmsDriver =
  | { type: 'sitemap';   sitemapUrl: string }
  | { type: 'firecrawl'; siteUrl: string; apiKey: string; /* + v2 map options */ }
  | { type: 'static';    pages: PageEntry[]; sections?: ContentSection[] }
  | { type: 'manual';    sections: ContentSection[] }
  | { type: 'my-driver'; /* your opts */ }   // ← add here
```

**3. Handle in `resolveContent()`** (`packages/core/src/llms.ts`): the switch that maps config → driver:

```ts
case 'my-driver':
  return myDriver(d).resolve()
```

**4. Add CLI auto-detection** (`packages/cli/src/project-probe.ts`) if the driver can be inferred from the project (e.g. a lockfile, env var, or config file presence):

```ts
// inside detectProject()
if (hasFile('.myservice.json') || env.MY_SERVICE_API_KEY) {
  detected.suggestedDriver = 'my-driver'
}
```

---

## Key design decisions

**One config object drives everything.** `AgenticConfig` is the single source of truth. Every generator and every middleware adapter reads from it. Users write the config once; the framework handles the rest.

**`@herald/core` has zero runtime dependencies.** It can run anywhere: Node.js, edge runtimes, Deno, Bun. Framework-specific code lives in `@herald/addon` sub-paths behind optional peer deps.

**We hand-roll x402 v2 against the public facilitator.** The `@x402/*` SDK family exists but adds a v1↔v2-flavored decision flow that doesn't compose with our MPP-first ordering. Our `x402.ts` is ~250 lines (atomic-unit conversion, accepts builder, header coding, facilitator settle); cryptographic verification + on-chain settlement still happen in the facilitator. Override `x402.facilitatorUrl` to point at your own facilitator.

**One gate, three thin adapters.** All payment logic lives in `payment-gate.ts`'s `gateRequest()`. Adapters are <100 lines each and only do framework↔fetch shape conversion. Adding a new framework never requires touching payment code.

**MPP is layered before x402.** When `Authorization: Payment` is present we run mppx first; an agent that holds an MPP credential is never bounced through the x402 gate. The 402 challenge itself carries both protocols (x402 `accepts[]` body + MPP `WWW-Authenticate` header), so an agent only ever sees one 402.

**Mppx instance is built once, then `Mppx.compose(...)` rebuilt per request.** The instance (with `secretKey`/`realm`/registered methods) is cached in a `WeakMap<AgenticConfig>`. Per-request we call `Mppx.compose(tempo.charge({amount, recipient}), stripe.charge({amount, currency}))(request)` so amounts can vary by route while construction is amortized.

**Validation is split across two layers with different purposes.** `@herald/core` exports `validateRobotsTxt`, `validateLlmsTxt`, `validateAgentsTxt`, and `validateAgentsJson`; these are *semantic spec compliance* checks on generated outputs (does robots.txt block the right scrapers? does llms.txt start with `#`?). They run post-generation and live in core because they're useful to any caller. The CLI's `config-schema.ts` is a *Zod structural schema* for `AgenticConfig`; it validates user-supplied input before generation and lives in the CLI only to keep core's zero-runtime-dep guarantee intact. Adding Zod to core would break compatibility with edge runtimes and Deno/Bun deployments.

**`agents.txt` and `agents.json` are complementary, not redundant.** `agents.txt` is the announcement layer: minimal, plain text, easy to serve anywhere, readable by humans and simple parsers. `agents.json` is the machine-first catalog: structured, schema-validatable, with richer per-block detail (pricing upfront, chain IDs, authorization discovery pointer, MCP transport type). The relationship mirrors `llms.txt` and `llms-full.txt`. Both are generated from the same config; site operators write nothing extra. Sites should serve both; agents that support structured JSON should prefer `agents.json`.
