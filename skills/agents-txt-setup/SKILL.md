---
name: agents-txt-setup
description: Guides Claude through setting up the `@agentstxtdev/herald` CLI on a user's website. Covers the init wizard, agentsjson.config.js fields, and file generation (robots.txt / sitemap.xml / llms.txt / agents.txt / agents.json / security.txt / `_headers`). Herald only generates discovery files; the runtime 402 handler that implements payment protocols declared in those files is out of scope. Use when the user wants to add herald to their project, generate the discovery files, or advertise payment / auth / MCP / Skills / A2A / UCP / WebMCP capabilities to agents.
---

# herald: setup

## Diagnose first

Before giving any instructions, determine three things (infer from context or ask):

1. **Framework**: Next.js / Express / Hono / Astro / static (no server) / other
2. **Payments to advertise**: none / x402 (crypto USDC per-request) / MPP (fiat or USDC session) / AP2 / experimental (`x-` prefix). Remember: herald only *declares* the capability; the user (or someone else's package) implements the 402 handler.
3. **Content source**: `sitemap` (site has sitemap.xml) / `firecrawl` (richer, free API key at firecrawl.dev) / `manual`

Then follow the workflow below.

---

## Step 1: Run `init`

```bash
npm install -D @agentstxtdev/herald   # install once as a dev dependency
herald init                  # interactive wizard
herald init -y               # skip all prompts, use auto-detected defaults
```

**What `init` does internally:**
1. `detectProject()` reads `package.json` deps (detects framework), scans for `sitemap.xml`, reads `.env*` for wallet addresses and API keys
2. readline wizard prompts the user, all answers pre-filled from detection
3. Writes `agentsjson.config.js` via `buildAgenticConfigContent(choices)`

**Flag shortcuts** (skip individual prompts):
```
--name <name>           site name
--url <url>             site URL
--sitemap <url>         sitemap URL
--wallet <0x...>        EVM treasury address (embedded in agents.json declaration only)
--firecrawl-key <key>   Firecrawl API key
-y, --yes               skip everything
```

**Auto-detected `.env` keys** (wizard pre-fills from these):
`EVM_ADDRESS` / `TREASURY_ADDRESS`, `SOLANA_ADDRESS`, `STRIPE_SECRET_KEY`, `TEMPO_API_KEY`, `FIRECRAWL_API_KEY`, `NEXT_PUBLIC_SITE_URL` / `SITE_URL`

---

## Step 2: Configure `agentsjson.config.js`

See [REFERENCE.md](REFERENCE.md) for the full annotated schema.

The single `AgenticConfig` object drives everything. Every generator reads from it.

**Key fields to explain to the user:**

| Field | What to tell them |
|---|---|
| `site.url` | Must be a valid URL. Used in every generated file. |
| `content.driver.type` | `sitemap` = parse sitemap.xml; `firecrawl` = crawl + group pages (richer, free tier); `static` / `manual` = provide pages yourself |
| `crawlers.blockFreeAiScrapers` | Blocks GPTBot, ClaudeBot, CCBot, Google-Extended in robots.txt |
| `payments.protocols` | `['x402']` / `['mpp']` / `['x402', 'mpp', 'ap2']`. Each identifier listed here is *advertised* in `agents.txt` / `agents.json`; herald does not implement the 402 handler. The list also accepts `x-` prefixed experimental identifiers (e.g. `'x-mypay'`) per spec §3.1; those flow through verbatim, runtime handler is the user's responsibility. |
| `payments.x402.treasury.evmAddress` | Their EVM wallet (40-char hex, 0x prefix). Embedded in `agents.json` so agents discover where to pay. No private keys ever. |
| `payments.mpp` | Same shape as `x402`: pricing + Tempo recipient + Stripe credentials are declared in the discovery files, never used by herald at runtime. |
| `a2a.cards` | One or more A2A AgentCard URLs (a2a-protocol.org). Optional. Useful when the site runs multiple A2A agents or serves AgentCards at non-canonical paths. The well-known path `/.well-known/agent-card.json` is enough for a single agent at the canonical location. |
| `webmcp.pages` | One or more page URLs whose documents register in-browser tools via `navigator.modelContext` (spec §6.6). Optional. Declare it when the site serves pages that call `navigator.modelContext.registerTool()`; herald emits only the page URL, never the tool set. |
| `security.contact` | RFC 9116 contact (`mailto:` / URL). Required for `/.well-known/security.txt` to be emitted. |

**Gotcha:** If Firecrawl is chosen, tell them to set `FIRECRAWL_API_KEY` in `.env`. Free tier at firecrawl.dev, no credit card.

**Honest declarations rule:** a per-protocol block in `agents.txt` / `agents.json` is emitted only when the necessary fields in `payments.<protocol>` are present. Listing `'mpp'` in `protocols` without setting `mpp.tempoRecipient` or Stripe credentials silently drops the protocol at generate time (with a console warning). This keeps the discovery files honest about what the site actually supports.

---

## Step 3: Generate files

```bash
herald emit --out ./public
```

**What `emit` does internally:**
1. Dynamic `import()` of `agentsjson.config.js`
2. Zod v4 validation: field-level errors printed before any file is written
3. Calls `generateRobotsTxt`, `generateLlmsTxt`, `generateAgentsTxt`, `generateAgentsJson`, `generateSitemapXml`, `generateSecurityTxt`, `generateHeadersFile` from `@agentstxtdev/herald-core` per the file's emission policy
4. Writes to `--out` dir (default `./public`); `vercel.json` writes to the project root with merge semantics
5. Runs spec validators inline, prints warnings, does not fail the build

**Flags:**
```
-c, --config <path>    config file path (default: ./agentsjson.config.js)
-o, --out <dir>        output directory (default: ./public)

# Positive selectors — pass any to emit only those files:
--robots               emit robots.txt
--llms                 emit llms.txt
--llms-full            emit llms-full.txt (requires content.fullTxt)
--agents               emit agents.txt + agents.json
--sitemap              emit sitemap.xml (also forces firecrawl-driver emission)
--security             emit /.well-known/security.txt (requires security.contact)
--headers              emit the §4.5 platform headers config

# Negative selectors — subtract from whichever set is selected:
--skip-robots          skip robots.txt
--skip-llms            skip llms.txt (useful if Firecrawl runs separately in CI)
--skip-llms-full       skip the Firecrawl scrape; keep the cheap llms.txt index
--skip-agents          skip agents.txt + agents.json
--skip-sitemap         never emit sitemap.xml
--skip-security        skip security.txt
--skip-headers         skip the §4.5 platform headers config
```

Default mode (no flags) emits everything applicable to the config. Pass any positive selector and only those files are emitted; pass `--skip-*` to subtract.

**For Astro / 11ty / Hugo / Jamstack** (and any framework): generation is all herald does. Deploy the output files as static assets; the production host applies the headers config at its edge. There is no runtime piece to wire.

**About the `_headers` / `vercel.json` file `emit` produces:** the agents.txt spec §4.5 mandates `Content-Type: text/plain; charset=utf-8` on `agents.txt`, `Content-Type: application/json` on `agents.json`, `Access-Control-Allow-Origin: *` on both, and recommends `Cache-Control: public, max-age=3600`. `herald emit --headers` detects the user's hosting platform and emits the right config to satisfy this without manual work:

| Detected platform | Emits | Where |
|---|---|---|
| Cloudflare (Workers / Pages) | `_headers` | `--out` (typically `public/`) |
| Netlify | `_headers` (same syntax as Cloudflare) | `--out` |
| Vercel | `vercel.json` with merge semantics | project root |
| Unknown | `_headers` as a best-effort default + console warning | `--out` |

For platforms herald doesn't write a config for (nginx, Apache, Caddy, S3+CloudFront, etc.), tell the user to translate the rules manually — the README has copy-paste server config snippets. They can also pass `--platform <name>` to force a specific generator, or `--skip-headers` if they serve the files dynamically and set the headers themselves in the route handler.

If the user serves `/agents.txt` or `/agents.json` from a server route rather than as a static file, the route handler must set `Content-Type` (with charset for the .txt), `Access-Control-Allow-Origin: *`, and `Cache-Control: public, max-age=3600` itself. Static-asset headers config does not reach dynamic routes.

**Mention the `$schema` field.** Every `agents.json` herald emits carries `"$schema": "https://agents-txt.com/schema/agents-json/v1.0.json"` at the top. Tell the user that any JSON-aware editor (VS Code, JetBrains, `jq --schema`) will read that URL and offer inline validation plus autocomplete the moment they open the generated file. Hand-edits stay honest: a typo in `payments.mpp.methods`, a missing required field, a non-https URL surface in the editor before deploy. The user does not need to do anything to opt in; the field is injected by `generateAgentsJson` automatically.

---

## Step 4: Verify compliance

```bash
herald check https://mysite.com
```

**What `check` does:** Fetches `robots.txt`, `llms.txt`, `agents.txt`, `agents.json`, `sitemap.xml` from the live URL and scores them using the same validators as `emit`, not ad-hoc string matching.

For deeper §4.5 verification (response headers + cross-file consistency between agents.txt and agents.json), point the user at the live `audit_site` MCP tool published by the agents.txt project at `https://agents-txt.com/mcp`. It validates Content-Type / CORS / Cache-Control on both files, schema-validates `agents.json` per §5, scans for accidental treasury or secret leaks per §5.4 / §14, and cross-checks that `agents.txt` and `agents.json` declare the same capabilities. Run both `herald check` and `audit_site` after deploy.

---

## Content driver decision

| Situation | Tell them to use |
|---|---|
| Site has `/sitemap.xml` | `type: 'sitemap'` (no API key needed) |
| Want titles + grouping by path | `type: 'firecrawl'` (free key at firecrawl.dev) |
| Jamstack with known page list | `type: 'static'` with `pages[]` |
| Full control over sections | `type: 'manual'` with `sections[]` |

---

## Payment protocol decision

Each identifier the user adds to `payments.protocols` is *advertised* in `agents.txt` / `agents.json`. The user (or someone else's package) is responsible for the matching 402 handler at runtime. Use this when advising on which to declare:

| Protocol | One-liner | Declare when… |
|---|---|---|
| **x402 v2** ([x402.org](https://x402.org/)) | Per-request crypto. Agent signs an EIP-3009 (EVM) or SVM payload after a 402; public facilitator settles on-chain. | They have a treasury wallet (EVM or Solana) and want micropayments per request. Set `x402.treasury` with `evmAddress` + `evmChains` and/or `solanaAddress` + `solanaNetwork`. |
| **MPP** ([mpp.dev](https://mpp.dev/), IETF draft) | Session-based, fiat + stablecoins via `WWW-Authenticate: Payment`. Tempo (USDC) and Stripe SPT (cards + Solana USDC). | They want to accept fiat or session-bound payments. Tempo activates with `mpp.tempoRecipient`; Stripe activates with `mpp.stripeSecretKey` + `mpp.stripeNetworkId`. Either independently. |
| **AP2** ([ap2-protocol.org](https://ap2-protocol.org/)) | Mandate trust layer that composes *above* the rail. Agent presents signed `CheckoutMandate` + `PaymentMandate` as W3C VCs; settlement still runs over x402 / MPP. | The business needs explicit, replayable user-authorization records for dispute resolution. Set alongside x402 or MPP, not as a replacement. |
| **UCP** ([ucp.dev](https://ucp.dev/)) | Profile-based commerce discovery. Site publishes a UCP profile (typically at `/.well-known/ucp`) describing services, capabilities, payment handlers. | The site serves richer commerce flows (multi-step, multi-handler) and already has a UCP profile authored. Herald emits the discovery pointer; the profile document is served separately. |
| **WebMCP** ([webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/)) | In-browser tool registration. A page calls `navigator.modelContext.registerTool()` to expose its functions as tools to an agent running in the browser tab. Complements the server-side `MCP:` directive. | The site serves pages that register in-browser tools. Herald emits the page URL; the tools are registered at runtime by the page's own JavaScript. |
| **`x-` experimental** | Any identifier the user invents (`'x-mypay'`). Herald passes it through verbatim. | A protocol that has not been registered in the spec yet but they want to advertise it on a live site. The runtime contract is entirely the user's responsibility. |

**Trust model.** x402-on-chain and MPP/Tempo are self-custodial (agent holds keys, signs the transfer). MPP/Stripe is custodial (Stripe holds keys on both sides). Stripe SPT can settle Solana USDC without involving any wallet on either side. Declaring both x402 and MPP reaches strictly more agents than either alone because wallet-native and customer-credential agent populations barely overlap.

**Honest declarations.** A per-protocol block is emitted into `agents.txt` / `agents.json` only when its credentials are set. If they list `'mpp'` but never set `mpp.tempoRecipient` or Stripe credentials, the protocol drops at generate time with a console warning. Tell them to expect this.

**Boundary reminder.** Wallet addresses (`evmAddress`, `solanaAddress`, `tempoRecipient`) are embedded in `agents.json` so agents discover where to pay. Stripe secret keys, Stripe network IDs, and `mpp.secretKey` never appear in any output, only in the operator's server environment.

---

## Common pitfalls to flag proactively

- `@agentstxtdev/herald-core` has zero runtime deps (edge-safe). The CLI is the only public surface; there is no runtime middleware shipped from herald.
- Herald does not verify payments or run a 402 handler. If the user expects requests to actually be gated by x402 or MPP, they need their own middleware. The `payments` block in `agentsjson.config.js` is purely the discovery declaration.
- `--skip-llms` is useful when Firecrawl is a separate CI step that takes too long; `--skip-llms-full` keeps the cheap `llms.txt` index but skips the Firecrawl-billed scrape.
- `pnpm` workspace required if contributing to the monorepo itself.
- `a2a` is optional. Most single-agent sites do not need it because A2A clients can probe `/.well-known/agent-card.json` directly. Suggest it only when the user has multiple A2A agents on one origin or serves an AgentCard at a non-canonical path.
- `webmcp` is optional. Declare it only when the site actually serves pages that call `navigator.modelContext.registerTool()`. It points at HTML pages, not a server endpoint, so it does not replace the server-side `MCP:` directive; a site can declare both.
- For protocols not yet listed in `payments.protocols` / `authorization.protocols`, point users at the `x-` prefix (e.g. `'x-mypay'`). Herald accepts them verbatim, validators pass them through without warnings, and there is no need to patch herald. Only suggest a registry edit (`packages/core/src/protocols.ts`) when the protocol is stable and the user wants herald-level support (wizard prompt, structured fields in `agents.json`).
