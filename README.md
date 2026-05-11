# AGENTIFY

**Make any website LLM-ready and monetizable by AI agents in minutes.**

[![npm: agentify](https://img.shields.io/npm/v/agentify?label=agentify&style=flat-square&color=cb3837)](https://www.npmjs.com/package/agentify)
[![Spec: agents.txt](https://img.shields.io/badge/spec-agents.txt-111?style=flat-square)](https://agentstxt.dev)
[![Payments: x402 v2 + MPP](https://img.shields.io/badge/payments-x402%20v2%20%2B%20MPP-7c3aed?style=flat-square)](#optional-add-on-payment-middleware)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/agentstxt/agents.txt?style=flat-square&logo=github&logoColor=white&color=181717)](https://github.com/agentstxt/agents.txt)

AGENTIFY is an open-source framework + CLI that emits the standard discovery files agents need to read and (optionally) pay for your site. One config object drives all of it. Each file is an independent open standard; pick the layers you want and AGENTIFY generates only those.

---

## What this does

| Without this | With this |
|---|---|
| AI crawlers scrape your content for free | Free scrapers blocked; paying agents allowed |
| Agents hallucinate about your site structure | `/llms.txt` gives agents a clean, curated index |
| No way for agents to discover payment terms | `/agents.txt` + `/agents.json` advertise capabilities and pricing |
| Missing out on agent-economy revenue | Agents pay `$0.001/request` via x402 + USDC |

### The files it generates / serves

```
/robots.txt   : RFC 9309 compliant, smart AI crawler rules            [default, --skip-robots]
/llms.txt     : llmstxt.org spec, auto-generated from sitemap/Firecrawl [optional, --skip-llms]
/sitemap.xml  : sitemaps.org 0.9, when you supply the URL list        [conditional; see below]
/agents.txt   : agents.txt spec, plain-text capability declaration    [optional, --skip-agents]
/agents.json  : agents.txt spec, structured JSON companion            [optional, --skip-agents]
```

Each file is its own open standard. AGENTIFY is the build/serve tooling for them. You can use it as a robots.txt-only generator, add llms.txt for content briefing, or go all the way with agents.txt + agents.json for capability discovery.

### Standards this builds on

| Standard | Role |
|----------|------|
| [robots.txt (RFC 9309)](https://www.rfc-editor.org/rfc/rfc9309) | Crawler access control |
| [sitemap.xml (sitemaps.org)](https://www.sitemaps.org/) | Content discovery |
| [llms.txt (llmstxt.org)](https://llmstxt.org/) | LLM-optimized site index |
| [x402 (x402.org)](https://x402.org/) | HTTP-native micropayments |
| [agent-auth](https://agentstxt.dev) | Agent identity + authorization |
| [MCP (modelcontextprotocol.io)](https://modelcontextprotocol.io/) | Tool/resource server discovery |
| [Agent Skills (agentskills.io)](https://agentskills.io/) | Skill package discovery |
| [Open Wallet Standard](https://openwallet.sh/) | Agent-side wallet (optional, for spending) |

<details>
<summary><b>More on the agents.txt standard</b></summary>

<br>

`agents.txt` (with companion `agents.json`) is a **lightweight, machine-readable capability declaration layer for websites in the agentic web**: a protocol-agnostic discovery file that publicly announces what agent-interaction capabilities a site supports, without embedding the implementation details of any specific protocol.

AGENTIFY implements the spec but does not own it. The spec lives at [agentstxt.dev](https://agentstxt.dev) under CC0. Anyone may implement it without restriction. The AGENTIFY reference implementation is Apache 2.0.

**Core design principles:**

- **Minimal & human-readable** (`agents.txt`): plain text (UTF-8, RFC 3629), easy to serve and understand at a glance
- **Rich & machine-first** (`agents.json`): structured JSON (UTF-8 per RFC 8259) optimized for autonomous agents
- **Standard-aligned companions** (`llms.txt` / `llms-full.txt`): UTF-8 Markdown (RFC 3629) per the llmstxt.org spec; `robots.txt` UTF-8 plain text per RFC 9309; `sitemap.xml` UTF-8 with XML declaration per sitemaps.org
- **Protocol & framework agnostic**: declares that a site *supports* a protocol (x402, MPP, agent-auth, MCP, etc.) without prescribing how that protocol works
- **Non-duplicative**: implementation details, schemas, pricing, endpoints, and credentials live in the protocol's own mechanisms (402 responses, `/.well-known/agent-configuration`, MCP connection, etc.)
- **Extensible**: new capability blocks can be added without breaking existing parsers

It is deliberately not a configuration file, not a full API spec, and not tied to any vendor. It is the neutral discovery layer for the entire agentic ecosystem.

</details>

<br>

### Where these files fit

AGENTIFY emits the four files that make up the agent-readiness stack:

```
Layer 1: ACCESS CONTROL     /robots.txt   (RFC 9309)         "You may enter my house"
Layer 2: PAGE INVENTORY     /sitemap.xml  (sitemaps.org)     "Here's how to navigate my house"
Layer 3: CONTENT BRIEFING   /llms.txt     (llmstxt.org)      "Here's what's inside my house"
Layer 4: AGENT CAPABILITIES /agents.txt   (agents.txt spec)  "Here's what you can do inside my house"
```

`agents.txt` (with companion `agents.json`) is the newest piece, an open standard for declaring agent-interaction capabilities (payments, auth, MCP, skills) without prescribing any specific protocol. AGENTIFY exists to make adopting it trivial; the spec itself lives at [agentstxt.dev](https://agentstxt.dev).

> [!NOTE]
> **AGENTIFY also ships an optional `x402 v2 + MPP` payment middleware for Express, Hono, and Next.js.**
>
> It is not part of the agents.txt standard; it is a convenience layer that wires payment endpoints lining up automatically with what AGENTIFY already declared for you in `agents.txt` / `agents.json`, so "make my site agent-ready *and* monetizable" collapses into a single config object.
>
> The middleware lives behind sub-path imports (`@agentify/web/express`, `@agentify/web/hono`, `@agentify/web/nextjs`). x402 v2 talks directly to the public facilitator at `https://x402.org/facilitator` (no `@x402/*` SDK required); MPP is layered on the optional `mppx` peer dep (Tempo USDC + Stripe SPT).
>
> Skip the *Optional add-on* section below if you only use AGENTIFY for discovery file generation.

---


<div align="center">

### Works out of the box

<table>
<tr>
  <th align="left">Agentic clients</th>
  <td align="center" width="60"><img src="assets/logos/openclaw.svg"   width="32" alt="OpenClaw"><br><sub>OpenClaw</sub></td>
  <td align="center" width="60"><img src="assets/logos/claude.svg"     width="32" alt="Claude Code"><br><sub>Claude</sub></td>
  <td align="center" width="60"><img src="assets/logos/codex.svg"      width="32" alt="Codex"><br><sub>Codex</sub></td>
  <td align="center" width="60"><img src="assets/logos/cursor.svg"     width="32" alt="Cursor"><br><sub>Cursor</sub></td>
  <td align="center" width="60"><img src="assets/logos/exy.png"        width="32" alt="Pi"><br><sub>Pi</sub></td>
  <td align="center" width="60"><img src="assets/logos/bash.svg"       width="32" alt="Bash"><br><sub>Bash</sub></td>
  <td align="center" width="60"><img src="assets/logos/http.svg"       width="32" alt="HTTP"><br><sub>HTTP</sub></td>
</tr>
<tr>
  <th align="left">Runtimes &amp; platforms</th>
  <td align="center"><img src="assets/logos/nodejs.svg"     width="32" alt="Node.js"><br><sub>Node.js</sub></td>
  <td align="center"><img src="assets/logos/express.svg"    width="32" alt="Express"><br><sub>Express</sub></td>
  <td align="center"><img src="assets/logos/nextjs.svg"     width="32" alt="Next.js"><br><sub>Next.js</sub></td>
  <td align="center"><img src="assets/logos/vercel.svg"     width="32" alt="Vercel"><br><sub>Vercel</sub></td>
  <td align="center"><img src="assets/logos/cloudflare.svg" width="32" alt="Cloudflare"><br><sub>Cloudflare</sub></td>
  <td align="center"><img src="assets/logos/railway.svg"    width="32" alt="Railway"><br><sub>Railway</sub></td>
  <td align="center"><img src="assets/logos/docker.svg"     width="32" alt="Docker"><br><sub>Docker</sub></td>
</tr>
<tr>
  <th align="left">Discovery files generated</th>
  <td align="center"><img src="assets/logos/robots.svg"      width="32" alt="robots.txt"><br><sub>robots.txt</sub></td>
  <td align="center"><img src="assets/logos/sitemap.svg"     width="32" alt="sitemap.xml"><br><sub>sitemap.xml</sub></td>
  <td align="center"><img src="assets/logos/llms.svg"        width="32" alt="llms.txt"><br><sub>llms.txt</sub></td>
  <td align="center"><img src="assets/logos/llms-full.svg"   width="32" alt="llms-full.txt"><br><sub>llms-full.txt</sub></td>
  <td align="center"><img src="assets/logos/agents-txt.svg"  width="32" alt="agents.txt"><br><sub>agents.txt</sub></td>
  <td align="center"><img src="assets/logos/agents-json.svg" width="32" alt="agents.json"><br><sub>agents.json</sub></td>
  <td></td>
</tr>
<tr>
  <th align="left">Payment protocols</th>
  <td align="center"><img src="assets/logos/x402.jpeg"            width="32" alt="x402 v2"><br><sub>x402 v2</sub></td>
  <td align="center"><img src="assets/logos/machine-payments.svg" width="32" alt="MPP"><br><sub>MPP</sub></td>
  <td colspan="5"></td>
</tr>
<tr>
  <th align="left">Chains</th>
  <td align="center"><img src="assets/logos/base.svg"     width="32" alt="Base"><br><sub>Base</sub></td>
  <td align="center"><img src="assets/logos/ethereum.svg" width="32" alt="Ethereum"><br><sub>Ethereum</sub></td>
  <td align="center"><img src="assets/logos/solana.svg"   width="32" alt="Solana"><br><sub>Solana</sub></td>
  <td align="center"><img src="assets/logos/tempo.png"    width="32" alt="Tempo"><br><sub>Tempo</sub></td>
  <td colspan="3"><sub><i>Any other CAIP-2 network via <code>x402.assets[network]</code> override</i></sub></td>
</tr>
<tr>
  <th align="left">Tokens &amp; rails</th>
  <td align="center"><img src="assets/logos/usdc.svg"   width="32" alt="USDC"><br><sub>USDC</sub></td>
  <td align="center"><img src="assets/logos/stripe.svg" width="32" alt="Stripe"><br><sub>Stripe</sub></td>
  <td colspan="5"><sub><i>Stripe SPT covers card networks + Solana USDC; any ISO 4217 currency via <code>mpp.stripeCurrency</code></i></sub></td>
</tr>
</table>

</div>





---

## Install

```bash
npm install @agentify/web
# or
pnpm add @agentify/web
```

```bash
npx agentify init       # interactive setup
npx agentify generate   # writes robots.txt, llms.txt, agents.txt, agents.json
                        # also writes sitemap.xml when content driver is static/manual
                        # also writes llms-full.txt when content.fullTxt is configured

# Pick exactly which files to emit with positive flags:
npx agentify generate --agents                  # only agents.txt + agents.json
npx agentify generate --robots --llms           # only robots.txt + llms.txt
npx agentify generate --robots                  # only robots.txt
npx agentify generate --sitemap                 # only sitemap.xml (also emits for firecrawl driver)
npx agentify generate --llms-full               # only refresh llms-full.txt

# Or subtract from the default with --skip-* (back-compat with previous CLI):
npx agentify generate --skip-agents             # everything except agents.txt + agents.json
npx agentify generate --skip-llms-full          # keep llms.txt, skip the expensive Firecrawl scrape
```

---

### Generated robots.txt example

`robots.txt` is the Layer 1 *access control* file for your site. The format is defined by the [Robots Exclusion Protocol (RFC 9309)](https://www.rfc-editor.org/rfc/rfc9309) and is honored by every well-behaved crawler. It declares which user agents may visit which paths, and it is the right place to draw the line between visitors you welcome and ones you do not.

Beyond the RFC, AGENTIFY's generator does four things on top of a plain `robots.txt`. It explicitly allows the major search engine crawlers (Googlebot, Bingbot, and similar) so your SEO is unaffected. It blocks the well-known free AI training scrapers (GPTBot, ClaudeBot, CCBot, Google-Extended) when `crawlers.blockFreeAiScrapers` is enabled, since those crawls produce no value for the site owner. It allows the paid agentic agents (such as `AgentstxtBot`) through to the rest of the stack, where they can negotiate access via x402 or MPP through `agents.txt`. And it appends the `Sitemap:` and `Content-Signal:` directives that downstream tools rely on for sitemap discovery and for stating AI-usage preferences. The default wildcard block also `Allow: /agents.txt` and `Allow: /llms.txt`, which both grants explicit access and exposes those files to any crawler reading `robots.txt` (no separate discovery directive is needed; `agents.txt` is fixed at the canonical path).

The generator also merges intelligently with an existing `robots.txt` file. Anything below the `# ── Existing rules (preserved) ──` marker is kept verbatim across regenerations, so any project-specific rules you have authored survive every `agentify generate` run.

```
# robots.txt
# Standard: https://www.rfc-editor.org/rfc/rfc9309

# Search engine crawlers
User-agent: Googlebot
User-agent: Bingbot
Allow: /

# Free AI training scrapers: blocked
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: CCBot
Disallow: /

# Paid agentic agents: x402 payment gate applies
User-agent: AgentstxtBot
Allow: /

# Default
User-agent: *
Allow: /llms.txt
Allow: /agents.txt
Allow: /

Sitemap: https://mysite.com/sitemap.xml
Content-Signal: search=yes, ai-train=no, ai-input=no
```

`Sitemap:` is the long-standing widely-supported extension that points at your URL inventory; it appears whenever the content driver produces an authoritative URL list (`static`, `manual`, or `firecrawl` with `--sitemap`). `Content-Signal:` follows the IETF AIPREF draft (CC0) and lets you state AI-usage preferences in a machine-readable way alongside the access rules above. There is intentionally no `Agents-Txt:` directive: the agents.txt spec (§4.3) fixes the file at `<origin>/agents.txt`, so the `Allow: /agents.txt` line in the wildcard block is sufficient discovery and a separate directive would only duplicate that information.

---

### sitemap.xml emission policy


AGENTIFY only emits `sitemap.xml` when it has authoritative URLs to put in it. The default policy keys off `content.driver`:

| Driver | Default | Why |
|---|---|---|
| `static` | emits `sitemap.xml` | you supplied the URL list (perfect input) |
| `manual` | emits `sitemap.xml` | curated sections with explicit URLs |
| `firecrawl` | skipped | Firecrawl returns a curated subset, not authoritative for a sitemap |
| `sitemap` | skipped | you already have one; re-emitting would be circular |

If your framework already generates a sitemap (Next.js `app/sitemap.ts`, `@astrojs/sitemap`, Hugo, Jekyll, 11ty), keep using it; pass `--skip-sitemap` and `robots.txt` will still reference your framework-emitted file via the `Sitemap:` directive.

---

### Generated llms.txt example

`llms.txt` is the Layer 3 *content briefing* for your site: an LLM-optimized index that follows the [llmstxt.org](https://llmstxt.org/) spec. It tells an agent what your site is and points at the pages worth reading, in a structured plain-text format. Format is fixed: an H1 with the site name, an optional `>` blockquote summary, then `## Section` headings each containing a bullet list of `[Title](url): description` lines. A trailing `## Optional` section flags pages an agent can safely ignore on a first pass.

The page list itself comes from `content.driver` in your `agentic.config.js`. The driver decides where the URLs originate (your existing `sitemap.xml`, a Firecrawl crawl, an explicit list of pages, or fully curated sections), and `@agentify/core` renders them into the format above. Payment terms, authentication, MCP endpoints, and skill packages **do not** belong in `llms.txt`; those live one layer up in `agents.txt` / `agents.json`.

```markdown
# My Site

> A site accessible to AI agents.

## Docs
- [Getting Started](https://mysite.com/docs/getting-started): Quick start guide for new users.
- [API Reference](https://mysite.com/docs/api): Full API documentation with examples.

## Blog
- [How x402 Works](https://mysite.com/blog/x402): Deep dive into HTTP-native payments.

## Optional
- [Archive](https://mysite.com/archive): Older posts kept for reference.
```

For richer per-page descriptions and the expanded `llms-full.txt` companion (where the markdown body of each page is inlined under its heading), use the `firecrawl` content driver, covered next.

---

### Firecrawl integration (richer llms.txt)

<a href="https://firecrawl.dev"><img src="assets/logos/firecrawl-colored-light-wordmark.svg" alt="Firecrawl" height="36"></a>

<sub><i>Not sponsored or affiliated. Firecrawl is one of the supported content drivers.</i></sub>

Instead of parsing `sitemap.xml`, use [Firecrawl](https://firecrawl.dev) (free tier available) to crawl your site and generate a content-aware llms.txt:

```ts
content: {
  driver: {
    type: 'firecrawl',
    siteUrl: 'https://mysite.com',
    apiKey: process.env.FIRECRAWL_API_KEY,

    // optional: all map options from Firecrawl v2:
    limit: 5000,                    // default 5000, max 100000
    search: 'pricing',              // order results by relevance to a query
    sitemap: 'include',             // 'include' (default) | 'skip' | 'only'
    includeSubdomains: true,        // default true
    ignoreQueryParameters: true,    // default true; drops ?utm=... etc.
  },
},
```

Uses the Firecrawl [`/v2/map`](https://docs.firecrawl.dev/api-reference/endpoint/map) endpoint, which returns each URL with its title and description in one response. A single API call populates the entire llms.txt (no per-page scraping).

Get a free API key at [firecrawl.dev](https://firecrawl.dev) (no credit card for free tier).

### llms-full.txt: expanded companion with inlined page content

The [llmstxt.org](https://llmstxt.org) spec describes "expanded" forms (`llms-ctx.txt`, `llms-ctx-full.txt`) where each linked page's markdown content is inlined under its heading, so an LLM can ingest the whole site as one document. The community has converged on `/llms-full.txt` as the served filename. That's what agents look for, and that's what AGENTIFY emits.

By default `llms-full.txt` is built from the same URL list as `llms.txt`. The optional `content.fullTxt.driver` lets you point at a different URL list, useful when your `llms.txt` indexes the marketing site but you want `llms-full.txt` to ingest the docs subdomain:

```ts
content: {
  // /llms.txt: concise index of the marketing site
  driver: {
    type: 'sitemap',
    sitemapUrl: 'https://mysite.com/sitemap.xml',
  },

  // /llms-full.txt: pages from the docs subdomain, with content scraped to markdown
  fullTxt: {
    driver: {
      type: 'firecrawl',
      siteUrl: 'https://docs.mysite.com',
      apiKey: process.env.FIRECRAWL_API_KEY,
    },
  },
},
```

The spec doesn't restrict URLs in llms.txt to a single origin, so cross-domain `fullTxt` sources are spec-compatible.

Behavior per source driver type:
- **`firecrawl`**: pages are scraped via [`/v2/scrape`](https://docs.firecrawl.dev/api-reference/endpoint/scrape) (5 concurrent requests, markdown format, main-content only) and inlined under each heading. This is the recommended setup.
- **`sitemap` / `static` / `manual`**: emits the file with link + description per page but no scraped body content (we only have URLs to work with). Add a Firecrawl source if you want actual content inlined.

Omit the `fullTxt` block to skip llms-full.txt generation entirely.

---

### The agentify CLI and `agentic.config.js`


AGENTIFY is driven by a single file at your project root: **`agentic.config.js`**. It's the source of truth for every discovery file AGENTIFY emits and (when enabled) the payment middleware. The CLI creates, validates, and re-renders from it.

### Three commands

| Command | What it does | Output |
|---|---|---|
| `npx agentify init` | Interactive wizard. Detects framework / sitemap / `.env` and writes `agentic.config.js` at your project root (with sensible defaults you can edit later). Use `-y` to skip all prompts and accept detected values. | `./agentic.config.js` |
| `npx agentify generate` | Imports `agentic.config.js`, validates it, runs the generators (`@agentify/core`), writes `robots.txt`, `llms.txt`, `agents.txt`, `agents.json`, and (when applicable) `sitemap.xml` to `--out` (default `./public`). Each file passes its spec validator inline; failures print as warnings. | files under `--out` |
| `npx agentify check <url>` | Fetches the live discovery files from a public URL and scores them against the same validators that `generate` uses. Useful for CI or post-deploy smoke tests. | report on stdout |

Per-file flags for `generate`:

**Positive selectors** (pass one or more to emit only those files; otherwise everything applicable to the config is emitted):

- `--robots`: emit `robots.txt`
- `--llms`: emit `llms.txt`
- `--llms-full`: emit `llms-full.txt` (requires `content.fullTxt` in the config)
- `--agents`: emit `agents.txt` and `agents.json`
- `--sitemap`: emit `sitemap.xml` (also forces emission for the `firecrawl` driver; warns + skips for the `sitemap` driver since that would be circular)
- `--headers`: emit the §4.5 headers config for the detected hosting platform (`_headers` for Cloudflare/Netlify, `vercel.json` for Vercel; `--platform <name>` overrides detection). See *Serving headers* below for the details.

**Negative selectors** (subtract from whatever set is selected):

- `--skip-robots`: skip `robots.txt` (useful when your framework or CDN owns it)
- `--skip-llms`: skip `llms.txt`
- `--skip-llms-full`: skip `llms-full.txt` (keep `llms.txt`; useful when you only want to refresh the index)
- `--skip-agents`: skip `agents.txt` and `agents.json`
- `--skip-sitemap`: never emit `sitemap.xml`, even for `static` / `manual`
- `--skip-headers`: skip the §4.5 headers config file

See `npx agentify generate --help` for the full list.

### `agentic.config.js`: the file you create

You don't manually write this from scratch. Run **`npx agentify init`** in your project root and the wizard writes it for you. The file shape:

```js
// agentic.config.js  (lives at your project root)
export default {
  // Site metadata — required. Drives robots.txt, llms.txt, agents.txt, agents.json
  site: {
    name: 'My Blog',
    url: 'https://myblog.com',
    description: 'Technical writing about distributed systems.',
  },

  // Where llms.txt's page list comes from. Pick one driver:
  //   sitemap   — read your existing sitemap.xml
  //   firecrawl — crawl the live site (richer, requires FIRECRAWL_API_KEY)
  //   static    — supply pages[] inline
  //   manual    — supply sections[] with full control
  content: {
    driver: {
      type: 'firecrawl',
      siteUrl: 'https://myblog.com',
      apiKey: process.env.FIRECRAWL_API_KEY,
    },
  },

  // robots.txt rules
  crawlers: {
    blockFreeAiScrapers: true,   // GPTBot, ClaudeBot, CCBot, Google-Extended → Disallow
    allowSearchEngines: true,
    allowPaidAgents: true,
  },

  // Optional: payment middleware (only relevant if you also use @agentify/web)
  payments: {
    protocols: ['mpp', 'x402'],
    x402: {
      treasury: {
        evmAddress: '0xYourAddress',
        evmChains: ['eip155:8453'],
      },
      pricing: { amount: '0.001', token: 'USDC' },
    },
  },
}
```

The **same file** is consumed by:

- **CLI**: `npx agentify generate` reads it to write static files into `--out`
- **`@agentify/web` middleware**: `import config from './agentic.config.js'`, then `app.use(createAgenticRouter(config))` and `app.use('/api', agenticPaymentMiddleware(config, '/api'))`

You write it once. There is no separate runtime config; nothing duplicates.

### Where the file lives

- **Static / Jamstack sites** (Astro, Hugo, 11ty, Next.js export): at your project root, generated at build time by `npx agentify generate --out ./public`.
- **Server frameworks** (Express, Hono, Next.js App Router): at your project root, imported into your server file. The `@agentify/web` adapter serves the discovery files from memory and gates payments at request time.

### Validation

Both `init` and `generate` run a Zod schema (CLI-only, doesn't bloat `@agentify/core`). Errors print field-level paths so misconfiguration surfaces early:

```
❌ Failed to load config: Invalid agentic.config.js:
  • site.url: must be a valid URL e.g. https://mysite.com
  • payments.x402.treasury.evmAddress: must be a 40-char hex EVM address (0x...)
```

The `generate` step then runs the spec validators (RFC 9309 for robots.txt, llmstxt.org for llms.txt, agents.txt v1 for agents.txt/json, sitemaps.org 0.9 for sitemap.xml) on the *output* files and prints any compliance warnings, so a typo in your config can never silently produce a non-compliant file.

### Serving headers (agents.txt spec §4.5)

The agents.txt spec mandates four response headers on `/agents.txt` and `/agents.json`: a Content-Type with charset (for agents.txt), `Access-Control-Allow-Origin: *` (so browser-context agents can read the files cross-origin), and a `Cache-Control: public, max-age=3600` (SHOULD). Static-asset pipelines on most hosting platforms do not set these by default, so the headers have to be wired in some platform-specific way.

`agentify generate` handles this for you. The CLI detects your hosting platform from project files and emits the right config:

| Platform | Detected via | Emits |
|----------|--------------|-------|
| **Cloudflare** (Workers / Pages) | `wrangler.json`, `wrangler.toml`, `@astrojs/cloudflare`, `@cloudflare/workers-types`, `wrangler` dep | `_headers` in `--out` |
| **Netlify** | `netlify.toml`, `@netlify/plugin-*` | `_headers` in `--out` (same syntax as Cloudflare) |
| **Vercel** | `vercel.json`, `.vercel/` | `vercel.json#headers` at the project root, **merged** with any existing entries (the `/agents.txt` and `/agents.json` sources are replaced; everything else is preserved verbatim) |
| **Unknown** | nothing matched | `_headers` in `--out` as a best-effort default, plus a console warning. Translate to your platform's mechanism — see the per-platform table below. |

Override detection with `--platform <cloudflare\|netlify\|vercel\|unknown>` if needed. Skip the file with `--skip-headers`. Emit only the headers config with `--headers`.

For platforms the CLI does not generate for, configure the four headers yourself. Required values are the same regardless of mechanism:

```
/agents.txt
  Content-Type: text/plain; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600

/agents.json
  Content-Type: application/json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
```

| Platform | Mechanism |
|----------|-----------|
| Nginx | `add_header` directives inside the matching `location` block |
| Apache | `Header set` in `.htaccess` or vhost config |
| Caddy | `header` directive in your Caddyfile |
| AWS S3 + CloudFront | Response Headers Policy (or Lambda@Edge) attached to the distribution |
| Express / Hono / Next.js handlers | Set headers in the route handler that responds with the file. `@agentify/web` does this for routes it owns. |

Once deployed, run `agents.txt`'s own MCP `audit_site` tool against your live URL to verify §4.5 compliance:

```bash
# via the public MCP endpoint
mcp call audit_site '{"url": "https://mysite.com"}'
```

A clean run reports `corsAllOrigins: true`, the right `Content-Type` on each file, and a present `Cache-Control`.

<br>

---

<br>

<details>
<summary><font size="5"><b>Optional add-on: payment middleware</b></font></summary>

<br>

## Quick start

<details>
<summary><b>Express</b></summary>

<br>

```ts
import express from 'express'
import { createAgenticRouter, agenticPaymentMiddleware } from '@agentify/web/express'
import type { AgenticConfig } from '@agentify/core'

const config: AgenticConfig = {
  site: {
    name: 'My Site',
    url: 'https://mysite.com',
    description: 'A site accessible to AI agents.',
  },
  content: {
    driver: {
      type: 'sitemap',
      sitemapUrl: 'https://mysite.com/sitemap.xml',
    },
  },
  crawlers: {
    blockFreeAiScrapers: true,   // Block GPTBot, ClaudeBot, CCBot, etc.
    allowSearchEngines: true,
    allowPaidAgents: true,
  },
  payments: {
    protocols: ['mpp', 'x402'],   // MPP first (session-based), x402 fallback (per-request)
    x402: {
      treasury: {
        evmAddress: '0xYourWalletAddress',
        evmChains: ['eip155:8453'],   // Base (cheap gas, USDC native)
      },
      pricing: { amount: '0.001', token: 'USDC' },
    },
  },
}

const app = express()

// Serve /robots.txt, /llms.txt, /agents.txt, /agents.json
app.use(createAgenticRouter(config))

// Gate /api/* behind x402 micropayments
app.use('/api', agenticPaymentMiddleware(config, '/api'))

app.get('/api/content', (req, res) => {
  res.json({ data: 'paid content' })
})

app.listen(3000)
```

</details>

<details>
<summary><b>Next.js (App Router)</b></summary>

<br>

Create four route files:

**`app/robots.txt/route.ts`**
```ts
import { robotsTxtHandler } from '@agentify/web/nextjs'
import config from '@/agentic.config'
export const GET = robotsTxtHandler(config)
```

**`app/llms.txt/route.ts`**
```ts
import { llmsTxtHandler } from '@agentify/web/nextjs'
import config from '@/agentic.config'
export const GET = llmsTxtHandler(config)
```

**`app/agents.txt/route.ts`**
```ts
import { agentsTxtHandler } from '@agentify/web/nextjs'
import config from '@/agentic.config'
export const GET = agentsTxtHandler(config)
```

**`app/agents.json/route.ts`**
```ts
import { agentsJsonHandler } from '@agentify/web/nextjs'
import config from '@/agentic.config'
export const GET = agentsJsonHandler(config)
```

**`middleware.ts`: gates API routes at the edge:**
```ts
import agenticConfig from './agentic.config.js'
import { createPaymentProxy } from '@agentify/web/nextjs'

export default createPaymentProxy(agenticConfig, '/api')
export const config = { matcher: ['/api/:path*'] }
```

**Payment-gated route handler (no extra code needed; the middleware handles 402):**
```ts
// app/api/content/route.ts
export async function GET() {
  return Response.json({ data: 'paid content' })
}
```

</details>

<details>
<summary><b>Hono</b></summary>

<br>

```ts
import { Hono } from 'hono'
import { createAgenticRoutes, agenticPaymentMiddleware } from '@agentify/web/hono'
import type { AgenticConfig } from '@agentify/core'

const config: AgenticConfig = {
  site: { name: 'My Site', url: 'https://mysite.com' },
  content: { driver: { type: 'sitemap', sitemapUrl: 'https://mysite.com/sitemap.xml' } },
  crawlers: { blockFreeAiScrapers: true },
  payments: {
    protocols: ['mpp', 'x402'],
    x402: {
      treasury: { evmAddress: '0xYourWalletAddress', evmChains: ['eip155:8453'] },
      pricing: { amount: '0.001', token: 'USDC' },
    },
  },
}

const app = new Hono()
createAgenticRoutes(app, config)
app.use('/api/*', agenticPaymentMiddleware(config, '/api'))

app.get('/api/content', (c) => c.json({ data: 'paid content' }))
export default app
```

</details>

---

<details>
<summary><b>The x402 v2 Payment Flow</b></summary>

<br>

When an agent tries to access a payment-gated route:

```
Agent → GET /api/content
         ← 402 Payment Required
            {
              x402Version: 2,
              resource: { url, description, mimeType: 'application/json' },
              accepts: [{
                scheme: 'exact',
                network: 'eip155:8453',
                amount: '1000',                                  // atomic units (micro-USDC)
                asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                payTo: '0xYourTreasury',
                maxTimeoutSeconds: 60,
                extra: { name: 'USDC', version: '2' }
              }]
            }

Agent signs an EIP-3009 (EVM) or SVM payment payload

Agent → GET /api/content  (with PAYMENT-SIGNATURE: <base64 PaymentPayload>)
         ← 200 OK
            PAYMENT-RESPONSE: <base64 SettlementResponse>  // { success, transaction, network, payer }
```

Verification + on-chain settlement are delegated to the public facilitator at
`https://x402.org/facilitator` by default. Payments
go directly to your treasury wallet (the facilitator does not custody funds).
Override with `x402.facilitatorUrl` to run your own.

When MPP is also configured, the same 402 carries an additional
`WWW-Authenticate: Payment` header; a single 402 advertises both protocols and
the agent picks whichever it supports.

Migration v1→v2 reference: https://docs.x402.org/guides/migration-v1-to-v2

</details>

<details>
<summary><b>What AGENTIFY actually does for x402 v2</b></summary>

<br>

AGENTIFY implements the resource-server side of x402 v2 directly, not via the official `@x402/express|hono|next` SDKs. Cryptographic verification and on-chain settlement are delegated to the facilitator. The whole flow is roughly 250 lines in [`packages/web/src/x402.ts`](packages/web/src/x402.ts):

| Step | What AGENTIFY does | Where it lives |
|---|---|---|
| 1. Build the 402 challenge | Translates `X402Config` into a `PaymentRequirements[]` array. Each entry carries `scheme: 'exact'`, CAIP-2 `network`, atomic-unit `amount`, `asset` (token contract or fiat code), `payTo`, `maxTimeoutSeconds`, and `extra` (e.g. `{ name: 'USDC', version: '2' }` for EVM; `{ name: 'USDC' }` for Solana). | `buildAccepts()` |
| 2. Wrap in the v2 body | Emits `{ x402Version: 2, error?, resource: { url, description, mimeType }, accepts }` as the 402 JSON response body. | `buildPaymentRequired()` |
| 3. Decode the agent's payment | Reads the `PAYMENT-SIGNATURE` header (also accepts the legacy `X-Payment` for v1 clients), runs `base64 → JSON.parse`, then runs a plain-TS shape validator that rejects malformed payloads (wrong types, missing required fields, non-numeric amounts) before any network round-trip. | `decodePaymentSignature()`, `validatePaymentPayload()` |
| 4. Match against advertised accepts | Looks up the agent's chosen `accepted` block (`network` + `amount`) in the `accepts[]` we issued. Mismatch returns 400; agents can't pay $0.001 for a $0.01 route. | `matchAccepts()` |
| 5. Settle via the facilitator | POSTs `{ x402Version: 2, paymentPayload, paymentRequirements }` to `${facilitatorUrl}/settle`. Default facilitator is `https://x402.org/facilitator` (free, no API key); override via `x402.facilitatorUrl`. The facilitator verifies the EIP-3009 / SVM signature, replay-checks the nonce, submits the on-chain transaction, returns `SettlementResponse`. | `settleX402()` |
| 6. Return the verified response | On success, attaches `PAYMENT-RESPONSE: <base64 SettlementResponse>` to the protected response and lets the request through. On failure, re-issues a 402 with the facilitator's error reason. | `encodePaymentResponse()`, `gateRequest()` |

**Built-in USDC asset addresses** (no extra config needed for the common case):

| Network | CAIP-2 | USDC contract |
|---|---|---|
| Base mainnet | `eip155:8453` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `eip155:84532` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Ethereum mainnet | `eip155:1` | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Solana mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Solana devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

For non-USDC tokens or other CAIP-2 networks, set `x402.assets[network] = '<contract>'`.

**Security boundary.** AGENTIFY does not verify cryptographic signatures, hold private keys, replay-protect state, or submit on-chain transactions. The facilitator does. The trust assumption is "the facilitator at `facilitatorUrl` honestly verifies and settles", the same assumption every x402 server makes, including ones using the official SDK. Run your own facilitator if that trust isn't acceptable for your deployment.

</details>

<details>
<summary><b>Payment config</b></summary>

<br>

`@agentify/web` exposes a single `PricingConfig` abstraction for all protocols and runtimes. It implements x402 v2 directly and layers MPP via the optional `mppx` SDK; the same config fields drive both.

### `PricingConfig`

```ts
interface PricingConfig {
  amount:    string    // major-unit decimal, e.g. '0.01' = $0.01
  token?:    string    // display-only label ('USDC', 'USD')
  decimals?: number    // default 6 (USDC); Stripe always uses 2
}
```

`amount` is converted to the wire format per protocol:

| Protocol | Conversion | Example (`amount: '0.01'`) |
|---|---|---|
| **x402 v2 EVM/Solana** | `amount × 10^decimals` (default decimals = 6) | `accepts[].amount = '10000'` (atomic micro-USDC) |
| **MPP, Tempo (USDC.e)** | same as x402 (atomic) | `tempo.charge({ amount: '10000' })` |
| **MPP, Stripe** | `amount × 100` (currency-minor units) | `stripe.charge({ amount: '1', currency: 'usd' })` (1 cent) |

### `payments.x402.pricing` and `payments.mpp.pricing`

These set the default price for all protected routes. `x402.perPath` and `mpp.perPath` allow per-route overrides keyed by exact path.

`payments.x402.pricing` is emitted into `agents.json` so agents can pre-screen affordability before hitting a gated route. Wallet addresses never appear in discovery files; they live in `402` responses only.

### `agents.json` vs. `402` responses

| Field | Where it lives | Why |
|---|---|---|
| `payments.x402` (object) | `agents.json` | Presence signals x402 support; agents pre-check protocol availability |
| `payments.mpp` (object) | `agents.json` | Presence signals MPP support; same pre-check role as x402 |
| `payments.x402.chains` | `agents.json` | Agents verify chain compatibility before paying |
| `payments.mpp.methods` | `agents.json` | Configured MPP methods (`tempo`, `stripe`); pre-screening without hitting the 402 |
| `payments.pricing` | `agents.json` | Agents pre-screen affordability |
| `payments.required` (optional) | `agents.json` and `agents.txt` | Site-level policy: every interaction requires payment, no free path |
| Wallet addresses (`evmAddress`, `solanaAddress`, `tempoRecipient`) | `402` responses only | Security: never in discovery files |
| Stripe keys, API keys, MPP secret key | Server env only | Never in any output |

</details>

<details>
<summary><b>Supported protocols, chains, and tokens</b></summary>

<br>

Out of the box, `@agentify/web` issues a single 402 advertising both protocols at once; agents pick whichever they support.

### Protocols (gate decision order)

| Order | Protocol | Header (in) | Settlement | Pricing model |
|---|---|---|---|---|
| 1 | **MPP** | `Authorization: Payment …` | `mppx` SDK runs `Mppx.compose(tempo, stripe)` per request | one amount per route (or `mpp.perPath`) |
| 2 | **x402 v2** | `PAYMENT-SIGNATURE` (also accepts legacy `X-Payment`) | `POST {facilitatorUrl}/settle` (default `https://x402.org/facilitator`, free) | one amount per route (or `x402.perPath`) |

If neither header is present, both protocols' challenges are emitted in the same 402 response: x402 `accepts[]` in the body, MPP `WWW-Authenticate` in the headers.

### x402 v2: chains and tokens

Built-in CAIP-2 networks with USDC contract addresses baked in (no extra config required):

| Network | CAIP-2 ID | Default asset |
|---|---|---|
| Base mainnet | `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `eip155:84532` | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Ethereum mainnet | `eip155:1` | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Solana mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Solana devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

You select chains via `x402.treasury.evmChains` and `x402.treasury.solanaNetwork`. Any other CAIP-2 network or non-USDC token works through `x402.assets[network] = '<contract>'`. The set of networks a 402 will actually settle on is whatever your `facilitatorUrl` supports; `x402.org` covers EVM + Solana out of the box, and you can run your own facilitator for additional chains.

### MPP: methods and tokens

Activate by setting the relevant credentials. Both can run simultaneously and will appear together in the 402 challenge:

| Method | Activated by | Token / currency |
|---|---|---|
| **Tempo** (USDC) | `mpp.tempoRecipient` (0x… EVM address on Tempo) | USDC.e (`0x20c0…`) by default; override `mpp.tempoCurrency`. Set `mpp.tempoTestnet: true` for Tempo testnet. |
| **Stripe** (fiat + Solana via SPT) | `mpp.stripeSecretKey` + `mpp.stripeNetworkId` (Stripe Business Network profile ID) | `usd` by default; override `mpp.stripeCurrency` to any ISO 4217 currency Stripe supports. Payment method types default to `['card', 'link']`; override via `mpp.stripePaymentMethodTypes`. Stripe SPT covers card networks **and** Solana USDC. |

If `mppx` isn't installed (it's an optional peer dep), MPP is silently skipped and x402 still gates the route. If `stripe` isn't installed, only the Tempo leg of MPP is registered.

</details>

<details>
<summary><b>Configuration cheatsheet</b></summary>

<br>

> This is the `payments.*` slice of `AgenticConfig` shown exhaustively. The full file in your project also carries `site`, `content`, and `crawlers` blocks. See [The agentify CLI and `agentic.config.js`](#the-agentify-cli-and-agenticconfigjs) for the complete shape and how the file is created.

```ts
import type { AgenticConfig } from '@agentify/core'

const config: AgenticConfig = {
  site: { name: 'My Site', url: 'https://mysite.com' },
  payments: {
    protocols: ['mpp', 'x402'],                      // either, both, or one
    // required: true,                               // optional: site-level policy hint

    x402: {
      treasury: {
        evmAddress:    '0xYourEVMWallet',
        evmChains:     ['eip155:8453', 'eip155:1'],  // Base + Ethereum mainnet
        solanaAddress: 'YourSolanaPubkey',
        solanaNetwork: 'mainnet-beta',
      },
      pricing: { amount: '0.001', token: 'USDC' },   // major-unit decimal
      perPath: {
        '/api/premium': { amount: '0.01' },
      },
      // facilitatorUrl: 'https://x402.org/facilitator',   // default
      // assets: { 'eip155:42161': '0xARB_USDC_CONTRACT' }, // override per-network for non-USDC or new chains
      // maxTimeoutSeconds: 60,                              // per accepts[] entry
    },

    mpp: {
      secretKey:       process.env.MPP_SECRET_KEY,    // HMAC challenge binding (required in prod)
      tempoRecipient:  '0xYourEVMWallet',             // → enables Tempo USDC
      stripeSecretKey: process.env.STRIPE_SECRET_KEY, // ┐
      stripeNetworkId: process.env.STRIPE_NETWORK_ID, // ┴ enables Stripe (card + Solana via SPT)
      // stripeCurrency:           'usd',             // default
      // stripePaymentMethodTypes: ['card', 'link'],  // default
      pricing: { amount: '0.001', token: 'USD' },
      perPath: {
        '/api/premium': { amount: '0.01' },
      },
    },

    exemptUserAgents: ['MyAgenticSite/1.0'],
  },
}
```

**Install footprint:**

```bash
npm install @agentify/web express              # x402-only, no extras needed
npm install @agentify/web express mppx         # + MPP via Tempo
npm install @agentify/web express mppx stripe  # + Stripe (full MPP)
```

`@x402/*` packages are not required; `@agentify/web` implements x402 v2 directly.

</details>

</details>

---

## Packages

| Package | Purpose |
|---------|---------|
| `@agentify/core` | Pure generators: robots.txt, llms.txt, agents.txt, agents.json. No runtime deps. |
| `@agentify/web` | Middleware for Express / Next.js / Hono + x402 protocol |
| `agentify` (CLI) | `npx agentify init/generate/check` |

---

## Development

### Prerequisites

- Node.js ≥ 20.12.0 (`nvm use 24` recommended)
- pnpm ≥ 10

### Setup

```bash
git clone https://github.com/agentstxt/agents.txt
cd agents.txt/agentify
pnpm install
pnpm build       # builds core → web → cli in dependency order
```

### Build toolchain

| Tool | Role |
|------|------|
| [Turborepo](https://turbo.build) | Build orchestration, incremental caching, dependency-ordered tasks |
| [tsup](https://tsup.egoist.dev) | Bundles TypeScript to dual ESM + CJS + `.d.ts` in one pass |
| [Biome](https://biomejs.dev) | Lint + format (replaces ESLint + Prettier) |
| [Changesets](https://github.com/changesets/changesets) | Versioning and npm publish workflow |
| [publint](https://publint.dev) | Validates `exports` map correctness before publish |
| [Vitest](https://vitest.dev) | Test runner: ESM-native, no transpile config |

### Common commands

```bash
pnpm build          # turbo: build all packages (cached)
pnpm dev            # turbo: watch mode in parallel
pnpm test           # vitest run: all tests
pnpm typecheck      # tsc --noEmit across all packages
pnpm lint           # biome lint ./packages
pnpm format         # biome format --write ./packages
pnpm check          # biome check --write (lint + format)
pnpm publint        # validate exports maps in all packages
```

### Releasing

```bash
pnpm changeset          # describe what changed
pnpm version-packages   # bumps versions in package.json files
pnpm release            # pnpm build + changeset publish
```

### Build output

Each package produces dual-format output in `dist/`:

```
packages/core/dist/
  index.js      : ESM
  index.cjs     : CommonJS
  index.d.ts    : TypeScript declarations (ESM)
  index.d.cts   : TypeScript declarations (CJS)

packages/web/dist/
  index.js / index.cjs       : main entry
  express.js / express.cjs   : Express adapter
  hono.js / hono.cjs         : Hono adapter
  nextjs.js / nextjs.cjs     : Next.js adapter
  (+ matching .d.ts / .d.cts files)

packages/cli/dist/
  cli.js                     : ESM binary (#!/usr/bin/env node)
```

### Architecture constraints

- `@agentify/core` must have **zero runtime dependencies**. It must work on Node.js, Deno, Bun, and edge runtimes
- Never import Zod into `core` or `web`. Zod lives in `cli` only
- Never re-implement gate logic inside an adapter. All payment decisions go through `gateRequest()` in `payment-gate.ts`
- New framework adapters: convert `frameworkRequest → Request`, call `gateRequest(request, { config, pathPrefix })`, write back the `GateResult`. Mirror `express.ts` as the reference

---

## FAQ

**Does this replace robots.txt?**  
No. It generates a _better_ robots.txt that adds AI-specific rules on top of your existing ones. Your existing `robots.txt` is preserved.

**Do I need a crypto wallet to receive payments?**  
Yes, but only a public address (no private keys on the server). Create one with MetaMask, Coinbase Wallet, or any EVM wallet. Funds go directly on-chain.

**Can I use this without payments?**  
Absolutely. Omit the `payments` block entirely (or list `protocols` but leave the credentials unset; both produce the same output). AGENTIFY still generates robots.txt + llms.txt + agents.txt + agents.json, just without any payment capability advertised.

**Can I use this without agents.txt (just robots.txt and llms.txt)?**  
Yes. Run `npx agentify generate --robots --llms` to emit only those two files (or, equivalently from the default mode, `--skip-agents`). Pass just `--robots` for robots.txt only. AGENTIFY is the tooling; agents.txt is one of the layers it can emit, not a hard requirement.

**Is Firecrawl required?**  
No. It's optional. The default sitemap driver works without any API keys. Firecrawl gives better results (titles, descriptions, grouping) but is not required.

**How does payment verification work?**
We POST `{ x402Version: 2, paymentPayload, paymentRequirements }` to the facilitator's `/settle` endpoint and trust its `SettlementResponse`. The default facilitator is the free public one at `https://x402.org/facilitator`; it verifies cryptographic signatures and submits the on-chain transaction itself. Run your own facilitator and set `payments.x402.facilitatorUrl` if you need different policies. There is no built-in dev/trust mode; point `facilitatorUrl` at a local mock facilitator during development.

---

## License

This repository contains the agentify reference implementation only. It is released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0); see [`LICENSE`](LICENSE).

The agents.txt specification that agentify implements lives in a separate repository under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) at [agentstxt.dev](https://agentstxt.dev). Anyone may implement the spec without restriction.

---

*The open layer that makes any website part of the agentic economy.*

---

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=star-history/star-history&type=date&theme=dark&legend=top-left" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=star-history/star-history&type=date&legend=top-left" />
  <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=star-history/star-history&type=date&legend=top-left" />
</picture>
