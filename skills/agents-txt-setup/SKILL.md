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
| `payments.protocols` | `['x402']` = crypto only; `['mpp']` = fiat/USDC session; `['mpp','x402']` = both (MPP checked first). Also accepts `x-` prefixed experimental identifiers (e.g. `'x-mypay'`) per spec §3.1; those flow through to agents.txt and agents.json verbatim, runtime handler is the user's responsibility. |
| `payments.x402.treasury.evmAddress` | Their EVM wallet (40-char hex, 0x prefix). No private keys on server. |
| `payments.mpp` | Requires `npm install mppx`. Stripe for fiat; `tempoEnabled: true` for USDC without Stripe. |
| `a2a.cards` | One or more A2A AgentCard URLs (a2a-protocol.org). Optional. Useful when the site runs multiple A2A agents or serves AgentCards at non-canonical paths. The well-known path `/.well-known/agent-card.json` is enough for a single agent at the canonical location. |

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

# Positive selectors — pass any to emit only those files:
--robots               emit robots.txt
--llms                 emit llms.txt
--llms-full            emit llms-full.txt (requires content.fullTxt)
--agents               emit agents.txt + agents.json
--sitemap              emit sitemap.xml (also forces firecrawl-driver emission)

# Negative selectors — subtract from whichever set is selected:
--skip-robots          skip robots.txt
--skip-llms            skip llms.txt (useful if Firecrawl runs separately in CI)
--skip-llms-full       skip the Firecrawl scrape; keep the cheap llms.txt index
--skip-agents          skip agents.txt + agents.json
--skip-sitemap         never emit sitemap.xml
```

Default mode (no flags) emits everything applicable to the config. Pass any positive selector and only those files are emitted; pass `--skip-*` to subtract.

**For Astro / 11ty / Hugo / Jamstack**: generation is all they need. Deploy the output files with their site. No middleware.

**About the `_headers` / `vercel.json` file `generate` produces:** the agents.txt spec §4.5 mandates `Content-Type: text/plain; charset=utf-8` on `agents.txt`, `Content-Type: application/json` on `agents.json`, `Access-Control-Allow-Origin: *` on both, and recommends `Cache-Control: public, max-age=3600`. `agentify generate` detects the user's hosting platform and emits the right config to satisfy this without manual work:

| Detected platform | Emits | Where |
|---|---|---|
| Cloudflare (Workers / Pages) | `_headers` | `--out` (typically `public/`) |
| Netlify | `_headers` (same syntax as Cloudflare) | `--out` |
| Vercel | `vercel.json` with merge semantics | project root |
| Unknown | `_headers` as a best-effort default + console warning | `--out` |

For platforms agentify doesn't write a config for (nginx, Apache, Caddy, S3+CloudFront, etc.), tell the user to translate the rules manually — the README has copy-paste server config snippets. They can also pass `--platform <name>` to force a specific generator, or `--skip-headers` if they handle headers in their server framework (Express/Hono/Next.js handlers via `@agentify/web` already set them programmatically).

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

For deeper §4.5 verification (response headers + cross-file consistency between agents.txt and agents.json), point the user at the live `audit_site` MCP tool published by the agents.txt project at `https://agentstxt.dev/mcp`. It validates Content-Type / CORS / Cache-Control on both files, schema-validates `agents.json` per §10, scans for accidental treasury or secret leaks per §10.4 / §12, and cross-checks that `agents.txt` and `agents.json` declare the same capabilities. Run both `agentify check` and `audit_site` after deploy.

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
- `--skip-llms` is useful when Firecrawl is a separate CI step that takes too long; `--skip-llms-full` keeps the cheap `llms.txt` index but skips the Firecrawl-billed scrape
- `pnpm` workspace required if contributing to the monorepo itself
- `a2a` is optional. Most single-agent sites do not need it because A2A clients can probe `/.well-known/agent-card.json` directly. Suggest it only when the user has multiple A2A agents on one origin or serves an AgentCard at a non-canonical path.
- For protocols not yet listed in `payments.protocols` / `authorization.protocols`, point users at the `x-` prefix (e.g. `'x-mypay'`). Agentify accepts them verbatim, validators pass them through without warnings, and there is no need to patch agentify. Only suggest a registry edit (`packages/core/src/protocols.ts`) when the protocol is stable and the user wants agentify-level support (gate middleware, wizard prompt, structured fields in `agents.json`).
