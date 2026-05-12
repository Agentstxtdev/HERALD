<div align="center">

<img src="assets/logos/herald-mark-v2.svg" width="235" alt="HERALD">

<h1>HERALD</h1>

**Make any website LLM-ready and agent-discoverable in minutes.**

<br>

[![npm: @herald/cli](https://img.shields.io/npm/v/%40herald%2Fcli?label=%40herald%2Fcli&style=flat-square&color=cb3837)](https://www.npmjs.com/package/@herald/cli)
[![Spec: agents.txt](https://img.shields.io/badge/spec-agents.txt-111?style=flat-square)](https://agentstxt.dev)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/agentstxtdev/herald?style=flat-square&logo=github&logoColor=white&color=181717)](https://github.com/agentstxtdev/herald)

</div>

HERALD is an open-source framework + CLI that emits the standard discovery files agents need to read your site and discover its agent-interaction capabilities (including how to pay for access, when applicable). One config object drives all of it. Each file is an independent open standard; pick the layers you want and HERALD generates only those.

---

<div align="center">

### Works out of the box

<table>
<tr>
  <th align="left">Agentic clients</th>
  <td align="center" width="60"><img src="assets/logos/claude-code-dark.svg"   width="32" alt="Claude Code"><br><sub>Claude</sub></td>
  <td align="center" width="60"><img src="assets/logos/codex-dark.svg"     width="32" alt="Codex"><br><sub>Codex</sub></td>
  <td align="center" width="60"><img src="assets/logos/gemini-dark.svg"      width="32" alt="Gemini"><br><sub>Gemini</sub></td>
  <td align="center" width="60"><img src="assets/logos/cursor-dark.svg"     width="32" alt="Cursor"><br><sub>Cursor</sub></td>
  <td align="center" width="60"><img src="assets/logos/openclaw.png"        width="32" alt="OpenClaw"><br><sub>OpenClaw</sub></td>
  <td align="center" width="60"><img src="assets/logos/nous.png"       width="32" alt="Nous Research"><br><sub>Hermes</sub></td>
  <td align="center" width="60"><img src="assets/logos/exy.png"       width="32" alt="Pi"><br><sub>Pi</sub></td>
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
  <td align="center"><img src="assets/logos/a2a-logo-black.svg"    width="32" alt="Agent2Agent"><br><sub>A2A</sub></td>
</tr>
<tr>
  <th align="left">Payment protocols declared</th>
  <td align="center"><img src="assets/logos/x402.jpeg"            width="32" alt="x402 v2"><br><sub>x402 v2</sub></td>
  <td align="center"><img src="assets/logos/machine-payments.svg" width="32" alt="MPP"><br><sub>MPP</sub></td>
  <td align="center"><img src="assets/logos/ap2-logo-black.svg"    width="32" alt="Agent Payments Protocol"><br><sub>AP2</sub></td>
  <td align="center"><img src="assets/logos/ucp.svg"    width="32" alt="Universal Commerce Protocol"><br><sub>UCP</sub></td>
  <td colspan="4"><sub><i>Capabilities advertised in <code>agents.txt</code> / <code>agents.json</code>; wiring lives outside HERALD</i></sub></td>
</tr>
</table>

</div>

## What this does

| Without this | With this |
|---|---|
| AI crawlers scrape your content for free | `robots.txt` blocks free scrapers and allows paying agents through |
| Agents hallucinate about your site structure | `/llms.txt` gives agents a clean, curated index |
| No way for agents to discover payment terms | `/agents.txt` + `/agents.json` advertise capabilities and pricing |
| No standard channel to advertise agent capabilities | A single config object emits every layer of the agent-readiness stack |

### The files it generates / serves

```
/robots.txt   : RFC 9309 compliant, smart AI crawler rules            [default, --skip-robots]
/llms.txt     : llmstxt.org spec, auto-generated from sitemap/Firecrawl [optional, --skip-llms]
/sitemap.xml  : sitemaps.org 0.9, when you supply the URL list        [conditional; see below]
/agents.txt   : agents.txt spec, plain-text capability declaration    [optional, --skip-agents]
/agents.json  : agents.txt spec, structured JSON companion            [optional, --skip-agents]
```

Each file is its own open standard. HERALD is the build/serve tooling for them. You can use it as a robots.txt-only generator, add llms.txt for content briefing, or go all the way with agents.txt + agents.json for capability discovery.

### Standards this builds on

| Standard | Role |
|----------|------|
| [robots.txt (RFC 9309)](https://www.rfc-editor.org/rfc/rfc9309) | Crawler access control |
| [sitemap.xml (sitemaps.org)](https://www.sitemaps.org/) | Content discovery |
| [llms.txt (llmstxt.org)](https://llmstxt.org/) | LLM-optimized site index |
| [x402 (x402.org)](https://x402.org/) | HTTP-native micropayments |
| [MPP (mpp.dev, IETF draft)](https://mpp.dev/) | Session-based fiat + stablecoin payments |
| [agent-auth](https://agentauthprotocol.com/) | Agent identity + authorization |
| [MCP (modelcontextprotocol.io)](https://modelcontextprotocol.io/) | Tool/resource server discovery |
| [Agent Skills (agentskills.io)](https://agentskills.io/) | Skill package discovery |
| [A2A (a2a-protocol.org)](https://a2a-protocol.org/) | Agent-to-agent AgentCard discovery |
| [Open Wallet Standard](https://openwallet.sh/) | Agent-side wallet (optional, for spending) |

<details>
<summary><b>More on the agents.txt standard</b></summary>

<br>

`agents.txt` (with companion `agents.json`) is a **lightweight, machine-readable capability declaration layer for websites in the agentic web**: a protocol-agnostic discovery file that publicly announces what agent-interaction capabilities a site supports, without embedding the implementation details of any specific protocol.

HERALD implements the spec but does not own it. The spec lives at [agentstxt.dev](https://agentstxt.dev) under CC0. Anyone may implement it without restriction. The HERALD reference implementation is Apache 2.0.

**Core design principles:**

- **Minimal & human-readable** (`agents.txt`): plain text (UTF-8, RFC 3629), easy to serve and understand at a glance
- **Rich & machine-first** (`agents.json`): structured JSON (UTF-8 per RFC 8259) optimized for autonomous agents
- **Standard-aligned companions** (`llms.txt` / `llms-full.txt`): UTF-8 Markdown (RFC 3629) per the llmstxt.org spec; `robots.txt` UTF-8 plain text per RFC 9309; `sitemap.xml` UTF-8 with XML declaration per sitemaps.org
- **Protocol & framework agnostic**: declares that a site *supports* a protocol (x402, MPP, agent-auth, MCP, A2A, etc.) without prescribing how that protocol works
- **Non-duplicative**: implementation details, schemas, pricing, endpoints, and credentials live in the protocol's own mechanisms (402 responses, `/.well-known/agent-configuration`, AgentCard, MCP connection, etc.)
- **Extensible**: new capability blocks can be added without breaking existing parsers. Experimental identifiers (`x-mypay`, `x-myauth`) are accepted everywhere parsers see registered ones, giving new protocols a runway before formal registration

It is deliberately not a configuration file, not a full API spec, and not tied to any vendor. It is the neutral discovery layer for the entire agentic ecosystem.

</details>

<br>

### Where these files fit

HERALD emits the four files that make up the agent-readiness stack:

```
Layer 1: ACCESS CONTROL     /robots.txt   (RFC 9309)         "You may enter my house"
Layer 2: PAGE INVENTORY     /sitemap.xml  (sitemaps.org)     "Here's how to navigate my house"
Layer 3: CONTENT BRIEFING   /llms.txt     (llmstxt.org)      "Here's what's inside my house"
Layer 4: AGENT CAPABILITIES /agents.txt   (agents.txt spec)  "Here's what you can do inside my house"
```

`agents.txt` (with companion `agents.json`) is the newest piece, an open standard for declaring agent-interaction capabilities (payments, auth, MCP, skills) without prescribing any specific protocol. HERALD exists to make adopting it trivial; the spec itself lives at [agentstxt.dev](https://agentstxt.dev).

> [!NOTE]
> **HERALD declares payment capabilities. It does not wire the payment endpoints themselves.**
>
> When you set `payments` in `agentsjson.config.js`, HERALD emits the matching blocks in `agents.txt` and `agents.json` so agents can discover that your site supports `x402`, `mpp`, `ap2`, etc. and pre-screen pricing and chains. The actual 402 handler, signature verification, and on-chain settlement live outside HERALD; you supply them with your own middleware or a separate package.

---








---

## Install

```bash
npm install -D @herald/cli               # install as dev dependency
herald init                              # interactive setup → writes agentsjson.config.js
herald generate                          # writes discovery files to ./public
```

`@herald/core` is a transitive dependency pulled in automatically. You never install it directly.

---

### CLI flags

```bash
# Positive selectors (emit only these files):
herald generate --agents                  # only agents.txt + agents.json
herald generate --robots --llms           # only robots.txt + llms.txt
herald generate --robots                  # only robots.txt
herald generate --sitemap                 # only sitemap.xml
herald generate --llms-full               # only llms-full.txt

# Negative selectors (emit everything except):
herald generate --skip-agents             # skip agents.txt + agents.json
herald generate --skip-llms-full          # skip the expensive Firecrawl scrape
```

---

### Generated robots.txt example

`robots.txt` is the Layer 1 *access control* file for your site. The format is defined by the [Robots Exclusion Protocol (RFC 9309)](https://www.rfc-editor.org/rfc/rfc9309) and is honored by every well-behaved crawler. It declares which user agents may visit which paths, and it is the right place to draw the line between visitors you welcome and ones you do not.

Beyond the RFC, HERALD's generator does three things on top of a plain `robots.txt`. It explicitly allows the major search engine crawlers (Googlebot, Bingbot, and similar) so your SEO is unaffected. It blocks the well-known free AI training scrapers (GPTBot, ClaudeBot, CCBot, Google-Extended) when `crawlers.blockFreeAiScrapers` is enabled, since those crawls produce no value for the site owner. And it appends the `Sitemap:` and `Content-Signal:` directives that downstream tools rely on for sitemap discovery and for stating AI-usage preferences. The default wildcard block also `Allow: /agents.txt` and `Allow: /llms.txt`, which both grants explicit access and exposes those files to any crawler reading `robots.txt` (no separate discovery directive is needed; `agents.txt` is fixed at the canonical path).

The generator also merges intelligently with an existing `robots.txt` file. Anything below the `# ── Existing rules (preserved) ──` marker is kept verbatim across regenerations, so any project-specific rules you have authored survive every `herald generate` run.

```
# robots.txt
# Standard: https://www.rfc-editor.org/rfc/rfc9309

# Search engine crawlers
User-agent: Googlebot
User-agent: Bingbot
Allow: /

# Free AI training scrapers
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: CCBot
Disallow: /

# Default
User-agent: *
Allow: /llms.txt
Allow: /agents.txt
Allow: /

Sitemap: https://mysite.com/sitemap.xml
Content-Signal: search=yes, ai-train=no, ai-input=no
```

#### Reading each section

The generated file is intentionally low on inline commentary so it stays easy to scan and audit. Here is what each block means in practice:

- **Free AI training scrapers section.** These UAs are listed under a single `Disallow: /`. The intent is to keep free AI training crawls off your origin while leaving a structured path for *paying* agents to negotiate access through `agents.txt` and the x402 / MPP flows. The block is a soft signal (UA strings are advisory and trivially spoofable); the load-bearing enforcement for paid access lives in the 402 handler on your gated routes, not in `robots.txt`.
- **Paid agentic agents section** (emitted only when `crawlers.additionalAllowList` is set, or when a canonical paid-crawler UA exists — currently neither is true by default). When present, this block names UAs that should be `Allow`-ed through to the rest of your stack, where they can hit `agents.txt`, discover the payments block, and negotiate access via x402 or MPP. There is no canonical ecosystem-wide UA for this class yet, so the section is suppressed by default; adopters who run their own crawler and want sites to recognize it can use `crawlers.additionalAllowList: ['MyCrawlerBot']` in their config.
- **Default wildcard block.** Search engine and AI-scraper UAs above this block override it for those clients (RFC 9309 specificity). The wildcard exists so any other crawler reading `robots.txt` is explicitly told `/llms.txt` and `/agents.txt` are reachable, which doubles as discovery for those two files — no separate `Agents-Txt:` directive is needed because spec §4.3 fixes `agents.txt` at the canonical path.

`Sitemap:` is the long-standing widely-supported extension that points at your URL inventory; it appears whenever the content driver produces an authoritative URL list (`static`, `manual`, or `firecrawl` with `--sitemap`). `Content-Signal:` follows the IETF AIPREF draft (CC0) and lets you state AI-usage preferences in a machine-readable way alongside the access rules above.

---

### sitemap.xml emission policy


HERALD only emits `sitemap.xml` when it has authoritative URLs to put in it. The default policy keys off `content.driver`:

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

The page list itself comes from `content.driver` in your `agentsjson.config.js`. The driver decides where the URLs originate (your existing `sitemap.xml`, a Firecrawl crawl, an explicit list of pages, or fully curated sections), and `@herald/core` renders them into the format above. Payment terms, authentication, MCP endpoints, and skill packages **do not** belong in `llms.txt`; those live one layer up in `agents.txt` / `agents.json`.

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

The [llmstxt.org](https://llmstxt.org) spec describes "expanded" forms (`llms-ctx.txt`, `llms-ctx-full.txt`) where each linked page's markdown content is inlined under its heading, so an LLM can ingest the whole site as one document. The community has converged on `/llms-full.txt` as the served filename. That's what agents look for, and that's what HERALD emits.

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

### The `@herald/cli` and `agentsjson.config.js`


HERALD is driven by a single file at your project root: **`agentsjson.config.js`**. It's the source of truth for every discovery file HERALD emits. The CLI creates, validates, and re-renders from it.

### Three commands

| Command | What it does | Output |
|---|---|---|
| `herald init` | Interactive wizard. Detects framework / sitemap / `.env` and writes `agentsjson.config.js` at your project root (with sensible defaults you can edit later). Use `-y` to skip all prompts and accept detected values. | `./agentsjson.config.js` |
| `herald generate` | Imports `agentsjson.config.js`, validates it, runs the generators (`@herald/core`), writes `robots.txt`, `llms.txt`, `agents.txt`, `agents.json`, and (when applicable) `sitemap.xml` to `--out` (default `./public`). Each file passes its spec validator inline; failures print as warnings. | files under `--out` |
| `herald check <url>` | Fetches the live discovery files from a public URL and scores them against the same validators that `generate` uses. Useful for CI or post-deploy smoke tests. | report on stdout |

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

See `herald generate --help` for the full list.

### `agentsjson.config.js`: the file you create

You don't manually write this from scratch. Run **`herald init`** or **`herald generate --agents`**in your project root and the wizard writes it for you. The file shape:

```js
// agentsjson.config.js  (lives at your project root)
export default {
  // Site metadata — required. Drives robots.txt, llms.txt, agents.txt, agents.json
  site: {
    name: 'My Blog',
    url: 'https://myblog.com',
    description: 'Technical writing about distributed systems.',
  },

  // Where llms.txt's page list comes from. Pick one driver:
  //   sitemap   — read your existing sitemap.xml
  //   firecrawl — crawl the live site (richer titles, auto-grouping; needs FIRECRAWL_API_KEY)
  //   static    — hand-curated sections, no crawl
  //   manual    — supply sections[] with full control
  content: {
    driver: {
      type: 'static',
      pages: [],
      sections: [
        {
          name: 'Docs',
          pages: [
            { url: 'https://myblog.com/intro', title: 'Intro',   description: 'Project overview.' },
            { url: 'https://myblog.com/api',   title: 'API ref', description: 'Endpoint reference.' },
          ],
        },
      ],
      // Switch to firecrawl for an auto-crawled page list:
      // type: 'firecrawl',
      // siteUrl: 'https://myblog.com',
      // apiKey: process.env.FIRECRAWL_API_KEY,
    },
  },

  // robots.txt rules
  crawlers: {
    blockFreeAiScrapers: true,   // GPTBot, ClaudeBot, CCBot, Google-Extended → Disallow
    allowSearchEngines: true,
    allowPaidAgents: true,
  },

  // Optional: payment capability declaration (advertised in agents.txt / agents.json).
  // HERALD does not wire the 402 handler; bring your own middleware.
  payments: {
    protocols: ['x402', 'mpp', 'ap2'],
    x402: {
      treasury: {
        evmAddress: process.env.EVM_ADDRESS,
        evmChains: ['eip155:8453'],
        solanaAddress: process.env.SOLANA_ADDRESS,
        solanaNetwork: 'mainnet-beta',
      },
      pricing: { amount: '0.01', token: 'USDC' },
    },
    mpp: {
      tempoRecipient: process.env.TREASURY_TEMPO,
      pricing: { amount: '0.01', token: 'USDC' },
    },
    // AP2 mandate layer (ap2-protocol.org). Announces support; the mandate
    // exchange (CheckoutMandate / PaymentMandate) happens during checkout.
    ap2: {
      presentations: ['sd-jwt-vc'],
      spec: 'https://ap2-protocol.org',
    },
  },

  // Optional: agent identity verification (agent-auth)
  authorization: {
    enabled: true,
    protocols: ['agent-auth'],
    identityRequired: false,
  },

  // Optional: MCP endpoint declaration
  mcp: {
    endpoints: {
      url: 'https://myblog.com/mcp',
      description: 'MCP server exposing blog content and search.',
    },
  },

  // Optional: agent-installable skill packages (agentskills.io)
  skills: {
    urls: {
      url: 'https://myblog.com/skills/my-skill/SKILL.md',
      description: 'Teaches agents how to search and navigate this blog.',
    },
  },

  // Optional: A2A AgentCard discovery (a2a-protocol.org)
  a2a: {
    cards: {
      url: 'https://myblog.com/.well-known/agent-card.json',
      description: 'Blog assistant agent card.',
    },
  },

  // Optional: UCP profile discovery (ucp.dev)
  ucp: {
    profiles: {
      url: 'https://myblog.com/.well-known/ucp',
      description: 'UCP profile for commerce capabilities.',
    },
  },
}
```

**Experimental protocols (`x-` prefix).** Both `payments.protocols` and `authorization.protocols` accept identifiers prefixed with `x-` (for example `x-mypay`, `x-myauth`) per [agents.txt spec §3.1](https://agentstxt.dev). The generator emits them verbatim into `agents.txt` and as empty per-protocol objects in `agents.json` (`payments['x-mypay']: {}`). This is the runway for advertising a new protocol before it lands in the spec, without forking herald.

The same file is consumed by **`herald generate`**, which reads it to write the static discovery files into `--out`. You write it once. There is no separate runtime config; nothing duplicates.

### Where the file lives

- **Static / Jamstack sites** (Astro, Hugo, 11ty, Next.js export): at your project root, generated at build time by `herald generate --out ./public`.
- **Server frameworks** (Express, Hono, Next.js App Router): at your project root, generated at build time or on deploy. Serve the resulting files as static assets, or hand-roll a route that imports `@herald/core` to render them on demand.

### Validation

Both `init` and `generate` run a Zod schema (CLI-only, doesn't bloat `@herald/core`). Errors print field-level paths so misconfiguration surfaces early:

```
❌ Failed to load config: Invalid agentsjson.config.js:
  • site.url: must be a valid URL e.g. https://mysite.com
  • payments.x402: treasury must include at least one of evmAddress or solanaAddress (after lenient validation)
```

**Per-field lenient validation for optional wallet env vars.** The format checks for `evmAddress` (40-char `0x` hex), `solanaAddress` (32-char base58 minimum), and `stripeSecretKey` (`sk_` prefix) are still strict, but a malformed *optional* field no longer aborts the whole generate. Instead, the value is treated as `undefined` and the CLI prints a one-line warning:

```
herald: ignoring malformed evmAddress (evmAddress must be a 40-char hex EVM address (0x...)); set EVM_ADDRESS to a valid 0x[40 hex] value or unset to skip EVM.
```

This means a typo in an unused wallet (`EVM_ADDRESS=garbage` in your `.env` when you only meant to wire up Solana) does not break the Solana side. The `TreasuryConfigSchema.refine` rule still fires after the lenient pass: if every wallet is dropped, x402 fails with `treasury must include at least one of evmAddress or solanaAddress (after lenient validation)`, because x402 with no recipient is meaningless.

The `generate` step then runs the spec validators (RFC 9309 for robots.txt, llmstxt.org for llms.txt, agents.txt v1 for agents.txt/json, sitemaps.org 0.9 for sitemap.xml) on the *output* files and prints any compliance warnings, so a typo in your config can never silently produce a non-compliant file.

### Serving headers (agents.txt spec §4.5)

The agents.txt spec mandates four response headers on `/agents.txt` and `/agents.json`: a Content-Type with charset (for agents.txt), `Access-Control-Allow-Origin: *` (so browser-context agents can read the files cross-origin), and a `Cache-Control: public, max-age=3600` (SHOULD). Static-asset pipelines on most hosting platforms do not set these by default, so the headers have to be wired in some platform-specific way.

`herald generate` handles this for you. The CLI detects your hosting platform from project files and emits the right config:

| Platform | Detected via | Emits |
|----------|--------------|-------|
| **Cloudflare** (Workers / Pages) | `wrangler.json`, `wrangler.toml`, `@astrojs/cloudflare`, `@cloudflare/workers-types`, `wrangler` dep | `_headers` in `--out` |
| **Netlify** | `netlify.toml`, `@netlify/plugin-*` | `_headers` in `--out` (same syntax as Cloudflare) |
| **Vercel** | `vercel.json`, `.vercel/` | `vercel.json#headers` at the project root, **merged** with any existing entries (the herald-managed sources are replaced; everything else is preserved verbatim) |
| **Unknown** | nothing matched | `_headers` in `--out` as a best-effort default, plus a console warning. Translate to your platform's mechanism. See the per-platform table below. |

**A2A AgentCard paths included automatically.** When `a2a.cards` is set in `agentsjson.config.js`, the generator emits matching header entries for each same-origin AgentCard path alongside the `/agents.txt` and `/agents.json` entries. The headers used are `Content-Type: application/json`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`. AgentCards on a different origin from `site.url` are skipped because their headers are not the responsibility of this deployment. AgentCards (a2a-protocol.org) are not governed by agents.txt §4.5, but the CORS line is load-bearing for any browser-context A2A client probing the well-known path cross-origin, so it is included by default.

**Static file vs dynamic handler.** Headers config files (`_headers`, `vercel.json#headers`) apply only to *static* files on the hosting platform's asset pipeline. They do not apply to *dynamic* routes served by a handler or worker (Express, Next.js App Router, Hono, Cloudflare Workers route handlers, etc.). If you serve `/agents.txt` or an AgentCard dynamically, the route handler must set the headers in code (`Content-Type`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`). Agent-auth's `/.well-known/agent-configuration` endpoint is the canonical dynamic case: it is conventionally served by a handler and is therefore not emitted into the headers config.

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
| Express / Hono / Next.js handlers | Set headers in the route handler that responds with the file. |

Once deployed, run `agents.txt`'s own MCP `audit_site` tool against your live URL to verify §4.5 compliance:

```bash
# via the public MCP endpoint
mcp call audit_site '{"url": "https://mysite.com"}'
```

A clean run reports `corsAllOrigins: true`, the right `Content-Type` on each file, and a present `Cache-Control`.

---

## Packages

| Package | Purpose |
|---------|---------|
| `@herald/core` | Pure generators: robots.txt, llms.txt, agents.txt, agents.json. No runtime deps. |
| `@herald/cli` | `herald init/generate/check` |

---

## Adding a new protocol

Two paths exist depending on whether you want to ship the protocol experimentally or land it as a first-class herald feature.

### Path 1: experimental, in user space (`x-` prefix)

Use this when the protocol is new, you want to advertise it on a live site, and you do not need herald to know anything about it beyond its identifier. The spec reserves the `x-` prefix for exactly this case.

```js
// agentsjson.config.js
export default {
  site: { name: 'My Site', url: 'https://mysite.com' },
  payments: {
    protocols: ['x402', 'x-mypay'],
    x402: { treasury: { evmAddress: process.env.EVM_ADDRESS } },
  },
}
```

What you get out of the box: the identifier appears verbatim in `agents.txt` (`Protocols: x402, x-mypay`); it shows up in `agents.json` as `payments['x-mypay']: {}`; validators do not warn on it. The runtime handler is your responsibility.

No herald code changes needed. The runtime contract for the experimental protocol is entirely your responsibility: response shape, settlement, headers, etc.

### Path 2: register the protocol in herald

Use this when the protocol has settled enough that you want HERALD's generators, validators, and CLI wizard to know about it. Adding a new payment or auth protocol is a small, predictable diff thanks to the central registry.

1. **Registry** ([`packages/core/src/protocols.ts`](packages/core/src/protocols.ts)). Add the identifier to `PAYMENT_PROTOCOLS` or `AUTH_PROTOCOLS`. That single edit propagates to validators, the CLI Zod schema, and the audit tool.

2. **Types** ([`packages/core/src/types.ts`](packages/core/src/types.ts)). If the protocol has its own configuration block, add an interface (look at `X402Config` and `MppConfig` for shape). Hang it under `PaymentConfig` (or `AuthorizationConfig`) by the same name as the identifier.

3. **Activity check** ([`packages/core/src/payments.ts`](packages/core/src/payments.ts), payments only). Add an `isXyzActive(payments)` function that returns true when the necessary credentials are present, and a branch in `resolveActiveProtocols` that consults it. This is the "honest declarations" rule: the block is emitted only when the protocol can actually run.

4. **Generators** ([`packages/core/src/agents-txt.ts`](packages/core/src/agents-txt.ts), [`agents-json.ts`](packages/core/src/agents-json.ts)). The `Protocols:` line in `agents.txt` and the per-protocol object in `agents.json` are driven by `resolveActiveProtocols`, so payment protocols pick those up automatically once steps 1 and 3 are in place. If the protocol carries structured fields in `agents.json` (like `x402.chains` or `mpp.methods`), add a per-protocol emitter inside `generateAgentsJson` next to the existing ones.

5. **CLI wizard** ([`packages/cli/src/commands/init.ts`](packages/cli/src/commands/init.ts), optional). Add a prompt step inside the payments block if the new protocol needs credentials at init time.

6. **Tests**. Add cases in [`packages/core/src/__tests__/agents-txt.test.ts`](packages/core/src/__tests__/agents-txt.test.ts) and [`agents-json.test.ts`](packages/core/src/__tests__/agents-json.test.ts) that exercise emission with and without credentials.

For a brand-new block kind (not payment, not auth, not MCP, not Skills, not A2A), the same recipe extends to a new directive name. Add a parser case in the spec, plumb a new `XyzConfig` into `AgenticConfig`, and have the generators emit a fresh block separated by a blank line. The A2A block is the most recent worked example: look at the diff that introduced `A2AConfig`, the `A2A:` line emitter in `agents-txt.ts`, and the `a2a[]` array emitter in `agents-json.ts`.

### Adding A2A AgentCards to your site

A2A entries are optional. The well-known path `/.well-known/agent-card.json` is enough when you serve a single agent at the canonical location; AgentCard probing works without a `A2A:` directive. Declare the block when:

- You run more than one A2A agent on the same origin.
- You serve your AgentCard at a non-canonical path.
- You want to surface a description on each card in `agents.json` (the description field is `agents.json`-only; `agents.txt` carries only the URL).

The CLI wizard prompts for this after the payments block; the field is `a2a: { cards: <string | entry | array> }`.

---

## Development

### Prerequisites

- Node.js ≥ 20.12.0 (`nvm use 24` recommended)
- pnpm ≥ 10

### Setup

```bash
git clone https://github.com/agentstxtdev/herald
cd agents.txt/herald
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

packages/cli/dist/
  cli.js                     : ESM binary (#!/usr/bin/env node)
```

### Architecture constraints

- `@herald/core` must have **zero runtime dependencies**. It must work on Node.js, Deno, Bun, and edge runtimes
- Never import Zod into `core`. Zod lives in `cli` only

---

## FAQ

**Does this replace robots.txt?**  
No. It generates a _better_ robots.txt that adds AI-specific rules on top of your existing ones. Your existing `robots.txt` is preserved.

**Do I need a crypto wallet to declare payment support?**  
Only if you want a wallet address to appear in your `agents.json` declaration. A public address is enough (no private keys on the server). Create one with MetaMask, Coinbase Wallet, or any EVM wallet. HERALD only embeds the address in the discovery file; settlement happens in whatever payment middleware you wire up separately.

**Can I use this without payments?**  
Absolutely. Omit the `payments` block entirely (or list `protocols` but leave the credentials unset; both produce the same output). HERALD still generates robots.txt + llms.txt + agents.txt + agents.json, just without any payment capability advertised.

**Can I use this without agents.txt (just robots.txt and llms.txt)?**  
Yes. Run `herald generate --robots --llms` to emit only those two files (or, equivalently from the default mode, `--skip-agents`). Pass just `--robots` for robots.txt only. HERALD is the tooling; agents.txt is one of the layers it can emit, not a hard requirement.

**Is Firecrawl required?**  
No. It's optional. The default sitemap driver works without any API keys. Firecrawl gives better results (titles, descriptions, grouping) but is not required.

**Does HERALD verify payments or run a 402 handler?**
No. HERALD generates the discovery files that *advertise* payment support (`payments` block in `agents.txt` / `agents.json`, wallet addresses, pricing, accepted chains, etc.). The actual 402 handler, signature verification, and on-chain settlement live outside HERALD. Bring your own middleware (or a separate package) to wire those endpoints up.

---

## License

This repository contains the herald reference implementation only. It is released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0); see [`LICENSE`](LICENSE).

The agents.txt specification that herald implements lives in a separate repository under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) at [agentstxt.dev](https://agentstxt.dev). Anyone may implement the spec without restriction.

---

*The open layer that makes any website part of the agentic economy.*

---

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=star-history/star-history&type=date&theme=dark&legend=top-left" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=star-history/star-history&type=date&legend=top-left" />
  <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=star-history/star-history&type=date&legend=top-left" />
</picture>

</div>
