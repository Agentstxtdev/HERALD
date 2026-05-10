---
name: agents-txt-setup
description: Guides Claude through setting up the `agentify` CLI and `@agentify/web` middleware on a user's website. Covers the init wizard, agentic.config.js fields, file generation (robots.txt / sitemap.xml / llms.txt / agents.txt / agents.json), framework middleware wiring (Express / Next.js / Hono), and the optional payment middleware (x402 v2 + MPP). Use when the user wants to add agentify to their project, generate the discovery files, accept x402 or MPP payments, or wire up `@agentify/web` route handlers and middleware.
---

# agentify: setup

## Diagnose first

Before giving any instructions, determine three things (infer from context or ask):

1. **Framework**: Next.js / Express / Hono / Astro / static (no server) / other
2. **Payments**: none / x402 (crypto USDC per-request) / MPP (fiat or USDC session) / both
3. **Content source**: `sitemap` (site has sitemap.xml) / `firecrawl` (richer, free API key at firecrawl.dev) / `manual`

Then follow the workflow below.

---

## Step 1: Run `init`

```bash
npx agentify init          # interactive wizard
npx agentify init -y       # skip all prompts, use auto-detected defaults
```

**What `init` does internally:**
1. `detectProject()` reads `package.json` deps (detects framework), scans for `sitemap.xml`, reads `.env*` for wallet addresses and API keys
2. readline wizard prompts the user, all answers pre-filled from detection
3. Writes `agentic.config.js` via `buildAgenticConfigContent(choices)`

**Flag shortcuts** (skip individual prompts):
```
--name <name>           site name
--url <url>             site URL
--sitemap <url>         sitemap URL
--wallet <0x...>        EVM treasury address
--firecrawl-key <key>   Firecrawl API key
-y, --yes               skip everything
```

**Auto-detected `.env` keys** (wizard pre-fills from these):
`EVM_ADDRESS` / `TREASURY_ADDRESS`, `SOLANA_ADDRESS`, `STRIPE_SECRET_KEY`, `TEMPO_API_KEY`, `FIRECRAWL_API_KEY`, `NEXT_PUBLIC_SITE_URL` / `SITE_URL`

---

## Step 2: Configure `agentic.config.js`

See [REFERENCE.md](REFERENCE.md) for the full annotated schema.

The single `AgenticConfig` object drives everything. Every generator and middleware adapter reads from it.

**Key fields to explain to the user:**

| Field | What to tell them |
|---|---|
| `site.url` | Must be a valid URL. Used in every generated file. |
| `content.driver.type` | `sitemap` = parse sitemap.xml; `firecrawl` = crawl + group pages (richer, free tier); `static` / `manual` = provide pages yourself |
| `crawlers.blockFreeAiScrapers` | Blocks GPTBot, ClaudeBot, CCBot, Google-Extended in robots.txt |
| `payments.protocols` | `['x402']` = crypto only; `['mpp']` = fiat/USDC session; `['mpp','x402']` = both (MPP checked first) |
| `payments.x402.treasury.evmAddress` | Their EVM wallet (40-char hex, 0x prefix). No private keys on server. |
| `payments.mpp` | Requires `npm install mppx`. Stripe for fiat; `tempoEnabled: true` for USDC without Stripe. |

**Gotcha:** If Firecrawl is chosen, tell them to set `FIRECRAWL_API_KEY` in `.env`. Free tier at firecrawl.dev, no credit card.

---

## Step 3: Generate files

```bash
npx agentify generate --out ./public
```

**What `generate` does internally:**
1. Dynamic `import()` of `agentic.config.js`
2. Zod v4 validation: field-level errors printed before any file is written
3. Calls `generateRobotsTxt`, `generateLlmsTxt`, `generateAgentsTxt`, `generateAgentsJson`, `generateSitemapXml` from `@agentify/core`
4. Writes to `--out` dir (default `./public`)
5. Runs spec validators inline, prints warnings, does not fail the build

**Flags:**
```
-c, --config <path>    config file path (default: ./agentic.config.js)
-o, --out <dir>        output directory (default: ./public)
--skip-llms            skip llms.txt (useful if Firecrawl runs separately in CI)
```

**For Astro / 11ty / Hugo / Jamstack**: generation is all they need. Deploy the output files with their site. No middleware.

---

## Step 4: Wire middleware (server frameworks only)

See [REFERENCE.md](REFERENCE.md#middleware-snippets) for full copy-paste code.

**Express:**
```ts
import { createAgenticRouter, agenticPaymentMiddleware } from '@agentify/web/express'
app.use(createAgenticRouter(config))
app.use('/api', agenticPaymentMiddleware(config, '/api'))
```
> Gotcha: call `agenticPaymentMiddleware()` at **module load time**, never inside a request handler. The middleware caches the `Mppx.create({...})` instance per `AgenticConfig` (via WeakMap) so it's only built once.

**Next.js (App Router):** Create route handlers for `robots.txt`, `llms.txt`, `agents.json`, and `middleware.ts` with `createPaymentProxy`. See REFERENCE.md.

**Hono:**
```ts
import { createAgenticRoutes, agenticPaymentMiddleware } from '@agentify/web/hono'
createAgenticRoutes(app, config)
app.use('/api/*', agenticPaymentMiddleware(config, '/api'))
```

Install: `npm install @agentify/web`

---

## Step 5: Verify compliance

```bash
npx agentify check https://mysite.com
```

**What `check` does:** Fetches `robots.txt`, `llms.txt`, `agents.json`, `sitemap.xml` from the live URL and scores them using the same validators as `generate`, not ad-hoc string matching.

Run this after deploying to confirm everything is reachable and spec-compliant.

---

## Content driver decision

| Situation | Tell them to use |
|---|---|
| Site has `/sitemap.xml` | `type: 'sitemap'` (no API key needed) |
| Want titles + grouping by path | `type: 'firecrawl'` (free key at firecrawl.dev) |
| Jamstack with known page list | `type: 'static'` with `pages[]` |
| Full control over sections | `type: 'manual'` with `sections[]` |

---

## Common pitfalls to flag proactively

- MPP requires `npm install mppx` separately; warn before they hit a runtime error
- `mppx` passes through if not installed (dev-safe), but logs a warning
- x402 v2 is implemented directly against the public facilitator at `https://x402.org/facilitator` (no `@x402/*` SDK). MPP runs through the optional `mppx` peer dep (Tempo USDC + Stripe SPT).
- `@agentify/core` has zero runtime deps (edge-safe); payment code is in `@agentify/web`
- `--skip-llms` is useful when Firecrawl is a separate CI step that takes too long
- `pnpm` workspace required if contributing to the monorepo itself
