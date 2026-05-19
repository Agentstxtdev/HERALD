# HERALD: Codebase Guide

This document explains the architecture of the `herald` monorepo: what each package does, how the pieces fit together, and where to make changes when extending the system.

---

## What this project is

A file-generation framework that makes any website readable and agent-discoverable. It generates the discovery files of the agent-readiness stack from a single config object:

| Standard | File / surface | Purpose |
|---|---|---|
| RFC 9309 | `robots.txt` | AI crawler access control |
| sitemaps.org 0.9 | `sitemap.xml` | Page inventory |
| llmstxt.org | `llms.txt` (+ optional `llms-full.txt`) | LLM-optimized site index |
| `agents.txt` standard | `agents.txt` | Agent capabilities declaration (plain text) |
| `agents.txt` standard | `agents.json` | Agent capabilities catalog (structured JSON companion) |
| RFC 9116 | `security.txt` (`/.well-known/security.txt`) | Vulnerability disclosure channel |

The `agents.txt` standard is defined and maintained outside this repository; herald is an implementation of it. Anyone may write a different implementation; herald exists to make adoption trivial in JavaScript-/TypeScript-flavored projects.

Herald is a generator only. Runtime concerns like the 402 handler that implements payment protocols declared in `agents.txt` / `agents.json` are out of scope and live in whatever middleware an adopter wires up.

---

## Monorepo layout

```
herald/
├── packages/
│   ├── core/          — shared types + pure generators (no framework deps)
│   ├── cli/           — @agentstxtdev/herald
│   └── schema/        — @agentstxtdev/herald-schema: Zod source of truth for agents.json + JSON Schema derivation
├── docs/              — engineering decisions and changelog entries
├── skills/            — agent-installable skill packages (e.g. agents-txt-setup)
└── tsconfig.base.json — shared TypeScript config (ES2022, NodeNext, strict)
```

All packages are ESM (`"type": "module"`). TypeScript uses `NodeNext` module resolution throughout. pnpm workspaces link packages together via `workspace:*` references.

---

## Package: `@agentstxtdev/herald-core`

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
| `generateAgentsTxt()` | `agents.txt` | Plain-text capabilities declaration (payments, auth, MCP, skills, A2A, UCP, WebMCP) |
| `generateAgentsJson()` | `agents.json` | Structured JSON catalog: same config, richer per-block detail |
| `generateSitemapXml()` | `sitemap.xml` | sitemaps.org 0.9 `<urlset>` from a `PageEntry[]` (XML-escaped, deduped) |
| `generateSecurityTxt()` | `/.well-known/security.txt` | RFC 9116 disclosure channel; `Contact`, `Expires`, `Canonical`, `Policy` |
| `generateApiCatalog()` | `/.well-known/api-catalog` | RFC 9727 linkset+json. Anchors derived from `mcp` / `a2a` / `ucp`; service-desc and describedby links per anchor. No new config field. |
| `generateMcpServerCard()` | `/.well-known/mcp/server-card.json` | SEP-2127 server card. Requires `mcp.serverCard = { name, version, capabilities }`; returns `null` otherwise. |
| `generateAgentSkillsIndex()` | `/.well-known/agent-skills/index.json` | agentskills.io Discovery v0.2.0 with `$schema`, per-entry name / type / url / `digest: "sha256:<hex>"`. Entries lacking a digest are skipped with a warning. |
| `generateOpenApiJson()` | `/openapi.json` | OpenAPI 3.1 with `x-payment-info` per the Payment Discovery draft. Driven by `payments.openapi.paths`; single-offer paths use the direct shorthand, multi-offer use `offers[]`. |
| `generateHeadersFile(platform)` | `_headers` (Cloudflare/Netlify) or `vercel.json` (Vercel) | Platform-specific config carrying the spec §4.5 response headers (`Content-Type` with charset, `Access-Control-Allow-Origin: *`, `Cache-Control`). Also emits CORS entries for any ecosystem discovery surfaces the config declares, plus an RFC 8288 `Link:` block on `/` listing them. For Vercel, returns a JSON snippet the CLI merges with any existing `vercel.json`. |

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
  payments?:      PaymentConfig        // payment protocols (+ optional openapi for x-payment-info)
  authorization?: AuthorizationConfig  // declaration of supported auth protocols
  mcp?:           McpConfig            // MCP endpoint URLs (+ optional serverCard for SEP-2127)
  skills?:        SkillsConfig         // skill URLs (SkillEntry: name? type? digest? for v0.2.0 index)
  a2a?:           A2AConfig            // A2A AgentCard URLs (a2a-protocol.org)
  ucp?:           UcpConfig            // UCP profile URLs (ucp.dev)
  webmcp?:        WebMcpConfig         // WebMCP page URLs (webmachinelearning.github.io/webmcp)
  security?:      SecurityConfig       // RFC 9116 security.txt
}
```

Three opt-in extensions drive the ecosystem discovery surfaces (SEP-2127 MCP card, agentskills.io v0.2.0 index, Payment Discovery `x-payment-info`):

- `McpConfig.serverCard?: { name, version, capabilities: { tools, resources, prompts } }` — populates `/.well-known/mcp/server-card.json`. All three capability booleans are required by the SEP-2127 auditor.
- `SkillEntry.{ name?, type?, digest? }` — `name` defaults to the URL's last folder segment, `type` defaults to `'skill-md'`, `digest` is a `sha256:<hex>` string the user computes from the artifact (no IO inside core). An entry without a digest is included in `agents.txt` / `agents.json` but skipped from `/.well-known/agent-skills/index.json` with a warning at emit time.
- `PaymentConfig.openapi?: { title?, version?, paths: Record<string, { summary?, description?, offers[] }> }` — populates `/openapi.json`. Each offer is `{ intent, method, amount, currency?, description? }` per the Payment Discovery draft. The fourth ecosystem surface, `/.well-known/api-catalog` (RFC 9727), needs no new field; the linkset derives entirely from the `mcp` / `a2a` / `ucp` blocks.

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

### Payment protocols at a glance

Four registered protocols can appear in `payments.protocols` plus any `x-` prefixed experimental identifier per agents.txt spec §3.1. Herald only emits the declaration; the runtime handler is the adopter's responsibility.

**x402 v2** ([x402.org](https://x402.org/)): per-request crypto, on-chain settlement. Agent hits a route → 402 with `accepts[]` → signs an EIP-3009 (EVM) or SVM payload → retries with `PAYMENT-SIGNATURE` → response carries `PAYMENT-RESPONSE` with the settled receipt. The 402 challenge advertises `network` (CAIP-2), `amount` (atomic units), `asset` (token contract), `payTo`, and `maxTimeoutSeconds`. Verification + on-chain settlement are typically delegated to a public facilitator (e.g. `https://x402.org/facilitator`, free, no API key); the facilitator does not custody funds. `@agentstxtdev/herald-core` ships default USDC contract addresses for Base, Base Sepolia, Ethereum, Solana mainnet, Solana devnet; override per-network via `x402.assets[network]`. The chains advertised in `agents.json` are exactly `x402.treasury.evmChains` plus the implied Solana network.

**MPP** ([mpp.dev](https://mpp.dev/), IETF `draft-ryan-httpauth-payment`): session-based, fiat + stablecoins. 402 carries `WWW-Authenticate: Payment realm="…" challenge=<id>`; agent retries with `Authorization: Payment <credential>` and the response includes a signed `Payment-Receipt`. Two registered methods: Tempo (USDC) activates when `mpp.tempoRecipient` is set, Stripe SPT (card networks + Solana USDC) activates when both `mpp.stripeSecretKey` and `mpp.stripeNetworkId` are set. Either method may activate independently; both may coexist. `payments.mpp.methods` in `agents.json` lists whichever methods have credentials so an agent without a Tempo wallet learns Stripe is available without first hitting the challenge.

**AP2** ([ap2-protocol.org](https://ap2-protocol.org/)): mandate trust layer that composes *above* the payment rail. The agent presents a signed `CheckoutMandate` (what's being bought, by whom, under what limits) and a `PaymentMandate` (which payment method, for how much) as W3C Verifiable Credentials. Settlement still runs over the underlying rail (x402 / MPP / other). Setting `payments.ap2` declares the site accepts mandate-bound transactions; the mandate exchange itself is the runtime contract. Use case: business needs the auditability of explicit user authorization replayable for dispute resolution.

**UCP** ([ucp.dev](https://ucp.dev/)): profile-based commerce discovery. A site publishes a UCP profile (typically at `/.well-known/ucp`) describing its services, capabilities (e.g. `dev.ucp.shopping.ap2_mandate`), payment handlers (which rails it speaks), and signing keys. `ucp.profiles` flows into `agents.txt` (`UCP:` directive) and `agents.json` (`ucp[]` array) as the discovery *pointer*; the profile document itself is served separately (static JSON file the operator authors or generates themselves). Herald does not produce the profile body.

**WebMCP** ([webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/)): in-browser tool registration. A page calls `navigator.modelContext.registerTool()` to expose its own functions as structured tools to an AI agent operating inside the browser tab. Where the `MCP:` directive advertises server-side endpoints for headless agents, `WebMCP:` advertises pages an agent reads inside a browser-context runtime. `webmcp.pages` flows into `agents.txt` (`WebMCP:` directive) and `agents.json` (`webmcp[]` array) as the discovery *pointer*; the tool definitions are registered at runtime by each page's own JavaScript. Herald emits only the page URL.

#### Trust model: x402 vs MPP

Both protocols can move USDC and Stripe SPT can route Solana USDC under the hood, but they differ in who holds keys, who signs the transfer, and where settlement happens. Picking which protocols to advertise is a trust-model decision, not just a payment-rail decision:

| Protocol | Method | Who holds keys | Who signs the transfer | Where settlement happens |
|---|---|---|---|---|
| **x402 v2** | EVM or Solana | Agent holds its own private key | Agent signs the full transfer (EIP-3009 on EVM, SPL on Solana) | Public facilitator submits the agent-signed payload; on-chain |
| **MPP** | `tempo` | Agent holds its own Tempo wallet key | Agent signs the TIP-20 transfer | On Tempo chain |
| **MPP** | `stripe` | Stripe holds keys on both sides (custody) | Stripe internal | Stripe Payments Network; agent never signs an on-chain tx, even when SPT routes to Solana USDC |

Stripe SPT can settle Solana USDC without involving any wallet on either side: the agent presents a Stripe customer credential, Stripe processes the payment using its internal Solana USDC reserves, and the merchant receives a Stripe deposit. Same asset as x402-on-Solana, completely different trust model. A site declaring both rails reaches strictly more agents than one declaring either alone because wallet-native agents pay x402 (keys, no Stripe customer) and customer-credential agents pay MPP/Stripe (Stripe account, no chain identity); the two populations barely overlap.

#### Discovery boundary: `agents.json` vs `402` responses

| Field | Where it lives | Why |
|---|---|---|
| `payments.{x402,mpp,ap2}` (object) | `agents.json` | Presence signals protocol support; agents pre-check before issuing a request |
| `payments.x402.chains` | `agents.json` | Agents verify chain compatibility before paying |
| `payments.mpp.methods` | `agents.json` | Configured methods (`tempo`, `stripe`); pre-screening without hitting the 402 |
| `payments.pricing` | `agents.json` | Agents pre-screen affordability |
| `payments.required` (optional) | `agents.json` + `agents.txt` | Site-level policy: every interaction requires payment, no free path |
| Wallet addresses (`evmAddress`, `solanaAddress`, `tempoRecipient`) | `402` responses only | Security: never in discovery files |
| Stripe keys, MPP `secretKey`, API keys | Server env only | Never in any output |

The boundary rule is enforced by `resolveActiveProtocols` in [`packages/core/src/payments.ts`](../packages/core/src/payments.ts) plus the per-generator emit logic in `agents-txt.ts` and `agents-json.ts`.

### Payment types (`types.ts`)

Four payment protocols are modelled in the config so the generators can declare them in `agents.txt` and `agents.json`. None of this is runtime: the types describe the *declaration* shape, not a 402 handler. Herald embeds receiving wallet addresses and pricing in the discovery files; it does not verify signatures or settle payments.

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
interface WebMcpEntry  { url: string; description?: string }

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

interface WebMcpConfig {
  // One or more page URLs whose documents register in-browser tools via
  // navigator.modelContext (spec §6.6). Complements the server-side MCP:
  // directive; agents.txt carries only the page URL.
  pages: string | WebMcpEntry | (string | WebMcpEntry)[]
}
```

`AuthorizationConfig`, `McpConfig`, `SkillsConfig`, `A2AConfig`, and `WebMcpConfig` are independent of each other and of `PaymentConfig`. Each block in the generated files is omitted entirely when its config field is absent.

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

Adding a registered protocol is now a one-file edit: append to `PAYMENT_PROTOCOLS` or `AUTH_PROTOCOLS`. The full recipe is in [the README](README.md#adding-a-new-protocol). For payment protocols you also wire an activity check in `payments.ts` and (if the protocol carries structured fields) a per-protocol emitter in `agents-json.ts` alongside the existing x402 and MPP blocks. For a brand-new block kind, the WebMCP diff is the most recent worked example: a new `WebMcpConfig` type, a `WebMCP:` line emitter in `agents-txt.ts`, a `webmcp[]` array emitter in `agents-json.ts`, validator rules in `validate.ts`, a Zod schema entry in `config-schema.ts`, parser awareness in any tool that reads agents.txt, and a wizard prompt in the CLI.

## Package: `@agentstxtdev/herald`

```
packages/cli/src/
├── cli.ts               — Commander.js entry point (three commands)
├── project-probe.ts     — detectProject(): pure filesystem reads, no prompting
├── config-writer.ts     — buildAgenticConfigContent() + writeAgenticConfig() + s()
├── config-schema.ts     — Zod v4 schema for AgenticConfig (CLI-only, keeps core dep-free)
└── commands/
    ├── init.ts          — interactive wizard (orchestrates probe + writer)
    ├── emit.ts          — Zod-validates config, writes + spec-checks robots/llms/sitemap/agents-txt/agents-json
    └── check.ts         — fetches a live site and validates compliance
```

### `init` command

Orchestrates three concerns that are now separated into distinct modules:
1. **`project-probe.ts`**: `detectProject()` reads `package.json`, scans common paths for `sitemap.xml`, reads `.env` files for wallet addresses and API keys, and detects the hosting platform (`hostingPlatform: 'cloudflare' | 'netlify' | 'vercel' | 'unknown'`) from file presence (`wrangler.json`/`wrangler.toml`/`netlify.toml`/`vercel.json`/`.vercel/`) with a dep-based fallback (`@astrojs/cloudflare`, `@cloudflare/workers-types`, `wrangler`, `@netlify/plugin-*`). Pure reads, no side effects.
2. **`commands/init.ts`**: readline wizard that prompts the user and assembles an `AgenticConfigChoices` object from answers.
3. **`config-writer.ts`**: `buildAgenticConfigContent(choices)` converts structured choices into the `agentsjson.config.js` string; `writeAgenticConfig(path, choices)` writes it. The `s()` helper (JSON.stringify-based injection prevention) lives here.

The `-y` flag skips all prompts and uses detected defaults.

### `emit` command

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

On success, calls the generators from `@agentstxtdev/herald-core`, writes files to `--out` (default `./public`), then runs the spec compliance validators (`validateRobotsTxt`, `validateLlmsTxt`, `validateAgentsTxt`, `validateAgentsJson` from core) and prints any warnings inline.

Per-file flags come in two symmetric sets. The default mode emits everything applicable to the config; pass any positive selector and the output set narrows to those flags only; any `--skip-*` flag subtracts from whichever set is selected. Resolution rules live in `packages/cli/src/commands/emit.ts → resolveOutputs()`.

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
- `--skip-headers`: skip the §4.5 headers config (use when your platform isn't auto-generated for and you've configured headers elsewhere — nginx, Apache, Caddy, S3+CloudFront, programmatic handler in your own route, etc.)

**sitemap.xml emission policy:** default behavior depends on `content.driver`:

| Driver | Default | Resolution path |
|---|---|---|
| `static` | emit | `driver.pages` ∪ `driver.sections[].pages` |
| `manual` | emit | `driver.sections[].pages` |
| `firecrawl` | skip | `crawlWithFirecrawl()` (only when `--sitemap` is passed explicitly) |
| `sitemap` | skip | circular, already exists at the configured URL |

Pages are deduplicated by URL and XML-escaped before serialization in `generateSitemapXml`.

### `check` command

Fetches `robots.txt`, `llms.txt`, `agents.txt`, `agents.json`, and `sitemap.xml` from a live URL and scores the site using the same `validateRobotsTxt`, `validateLlmsTxt`, `validateAgentsTxt`, and `validateAgentsJson` functions from `@agentstxtdev/herald-core` that `emit` uses, not ad-hoc string matching.

## Package: `@agentstxtdev/herald-schema`

```
packages/schema/src/
├── agents-json-schema.ts  — Zod schema for the agents.json wire format
├── index.ts               — public exports + toJsonSchema() derivation
└── cli-emit.ts            — `node dist/cli-emit.js <out-dir>` writes the JSON Schema file
```

Single source of truth for three artefacts that downstream consumers expect to agree on: the runtime validator (`AgentsJsonSchema.safeParse(...)`), the TypeScript type (`AgentsJson` via `z.infer`), and the JSON Schema 2020-12 document hosted at `agents-txt.com/schema/agents-json/v1.0.json`. Zod cannot live in `@agentstxtdev/herald-core` because of the zero-runtime-dep rule, so it ships from its own package; the JSON Schema URL is duplicated between `@agentstxtdev/herald-core` (`AGENTS_JSON_SCHEMA_URL`) and `@agentstxtdev/herald-schema` (`SCHEMA_ID`) deliberately, with a round-trip integration test in `packages/schema/src/__tests__/herald-output.test.ts` catching drift between the producer and the schema.

To bump the wire-format version: edit `SCHEMA_VERSION` in `agents-json-schema.ts`, update the Zod object shape, rebuild, re-emit the JSON Schema file. The CLI helper writes `agents-json/v<VERSION>.json` so multiple versions coexist on the host. Adopters keep their old `$schema` reference valid; the new version ships at a new URL.

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

**One config object drives everything.** `AgenticConfig` is the single source of truth. Every generator reads from it. Users write the config once; the CLI emits every output from there.

**`@agentstxtdev/herald-core` has zero runtime dependencies.** It can run anywhere: Node.js, edge runtimes, Deno, Bun. Edge-runtime compatibility is a hard boundary; any new code in `core` that touches `node:fs`, `node:path`, or platform-specific globals breaks the contract.

**Declaration only.** Herald is a generator. It writes the discovery files that *announce* a site's agent-interaction capabilities (payments, auth, MCP, Skills, A2A, UCP, WebMCP); it does not implement the runtime handlers behind those declarations. The 402 handler, signature verification, and settlement live in whatever middleware the adopter wires up separately.

**Honest declarations.** A per-protocol block in `agents.txt` / `agents.json` is emitted only when the necessary fields in `AgenticConfig` are present. An adopter who lists `'mpp'` in `payments.protocols` but never sets `mpp.tempoRecipient` or Stripe credentials sees the protocol dropped at generate time, with a console warning. This rule is enforced by `resolveActiveProtocols` in `packages/core/src/payments.ts`.

**Validation is split across two layers with different purposes.** `@agentstxtdev/herald-core` exports `validateRobotsTxt`, `validateLlmsTxt`, `validateAgentsTxt`, and `validateAgentsJson`; these are *semantic spec compliance* checks on generated outputs (does robots.txt block the right scrapers? does llms.txt start with `#`?). They run post-generation and live in core because they're useful to any caller. The CLI's `config-schema.ts` is a *Zod structural schema* for `AgenticConfig`; it validates user-supplied input before generation and lives in the CLI only to keep core's zero-runtime-dep guarantee intact. Adding Zod to core would break compatibility with edge runtimes and Deno/Bun deployments.

**`agents.txt` and `agents.json` are complementary, not redundant.** `agents.txt` is the announcement layer: minimal, plain text, easy to serve anywhere, readable by humans and simple parsers. `agents.json` is the machine-first catalog: structured, schema-validatable, with richer per-block detail (pricing upfront, chain IDs, authorization discovery pointer, MCP transport type). The relationship mirrors `llms.txt` and `llms-full.txt`. Both are generated from the same config; site operators write nothing extra. Sites should serve both; agents that support structured JSON should prefer `agents.json`.
