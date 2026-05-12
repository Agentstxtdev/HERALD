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

## Serving the generated files

Herald only writes the files; deployment is the adopter's responsibility.

| Setup | How to serve the files |
|---|---|
| Static / Jamstack (Astro, Hugo, 11ty, Next.js export) | Build emits the files into `public/`; the hosting platform serves them as static assets with the §4.5 headers from `_headers` / `vercel.json`. |
| Server framework (Express, Hono, Next.js App Router) | Run `herald generate` at build time and serve `public/` statically, or hand-roll routes that import `@herald/core` and call the generators on demand. If the route is dynamic, the handler must set `Content-Type` (with charset for the `.txt` files), `Access-Control-Allow-Origin: *`, and `Cache-Control: public, max-age=3600` itself; static-asset header config does not apply. |

Herald does not ship a runtime middleware. The `payments` block in `agentsjson.config.js` flows into `agents.txt` and `agents.json` as a declaration of what the site supports; the 402 handler, signature verification, and on-chain or fiat settlement live entirely outside herald.

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
  --security             Emit /.well-known/security.txt (requires security.contact)
  --headers              Emit §4.5 headers config (`_headers` for Cloudflare/Netlify,
                         `vercel.json` for Vercel, fallback `_headers` otherwise)
  --platform <name>      Override the detected platform: cloudflare|netlify|vercel|unknown

  # Negative selectors — subtract from the selected (or default) set
  --skip-robots          Skip robots.txt
  --skip-llms            Skip llms.txt
  --skip-llms-full       Skip the Firecrawl scrape; keep llms.txt
  --skip-agents          Skip agents.txt + agents.json
  --skip-sitemap         Never emit sitemap.xml
  --skip-security        Skip security.txt
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

Quick test: run the build, then `ls` the output. If you can see the file, headers config applies. If the URL works but the file is absent, you are serving dynamically and the route handler must set `Content-Type` (with charset for the `.txt` files), `Access-Control-Allow-Origin: *`, and `Cache-Control: public, max-age=3600` itself.

Localhost dev-server parity is not herald's responsibility. Dev servers (Vite, Express, Hono, `vercel dev`, etc.) typically do not apply the production headers file at `localhost`, so `audit_site http://localhost:…` may report §4.5 fails that the same site does not exhibit in production. If you need cross-origin agent clients to reach `/agents.txt` or `/agents.json` from `localhost`, set the headers in your dev-server setup yourself (Vite plugin, Express middleware, etc.).

### §4.5 Headers — manual config for unsupported platforms

For nginx, Apache, Caddy, AWS S3+CloudFront, etc., the headers must be set in the platform's own configuration. Required values are the same:

```
/agents.txt  : Content-Type: text/plain; charset=utf-8 + ACAO: * + Cache-Control: public, max-age=3600
/agents.json : Content-Type: application/json + ACAO: * + Cache-Control: public, max-age=3600
```

Mirror the `/agents.json` shape for any additional same-origin static AgentCards declared in `a2a.cards`.

---

## What the payment declarations look like in the discovery files

Herald does not run a payment handler. The `payments` block in `agentsjson.config.js` is emitted into `agents.txt` (as the `Protocols:` line plus a per-protocol stanza) and `agents.json` (as a structured object per protocol) so agents can discover support before initiating a request. Example shapes:

**`agents.txt`** — plain-text declaration, agents pre-screen support from the `Protocols:` line:
```
Protocols: x402, mpp, ap2
Payments-X402-Chains: eip155:8453, solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
Payments-X402-Pricing: 0.001 USDC
Payments-MPP-Methods: tempo, stripe
Payments-MPP-Pricing: 0.001 USD
```

**`agents.json`** — structured catalog, agents read per-protocol detail:
```json
{
  "payments": {
    "x402": {
      "chains": ["eip155:8453"],
      "pricing": { "amount": "0.001", "token": "USDC" },
      "payTo": "0xYourTreasuryAddress"
    },
    "mpp": {
      "methods": ["tempo", "stripe"],
      "pricing": { "amount": "0.001", "token": "USD" }
    },
    "ap2": {
      "presentations": ["sd-jwt-vc"],
      "spec": "https://ap2-protocol.org"
    }
  }
}
```

Secret keys, Stripe credentials, and HMAC keys never appear in either file; only the receiving wallet's public address and pricing make it into the declaration. The 402 response itself (issued by whatever middleware the adopter wires up) is where signatures, nonces, and settlement details live.

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
PAYMENT_PROTOCOLS                       // readonly ['x402', 'mpp', 'ap2']
AUTH_PROTOCOLS                          // readonly ['agent-auth']
MPP_METHODS                             // readonly ['tempo', 'stripe']
isExperimentalIdentifier(value)         // value.startsWith('x-') && value.length > 2
isKnownPaymentProtocol(value)           // boolean
isKnownAuthProtocol(value)              // boolean
isAcceptedPaymentIdentifier(value)      // registered OR x- prefixed
isAcceptedAuthIdentifier(value)         // registered OR x- prefixed

// Headers (§4.5 platform config)
generateHeadersFile(platform)           // { filename, content } per hosting platform
mergeVercelHeaders(existing, herald)    // merge semantics for vercel.json
parseHeadersFile(content)               // round-trip parser; used by audit / live checks
parseVercelHeaders(json)
matchHeadersForPath(rules, pathname)    // resolve effective headers for a request path
headersDeploymentNote(platform)         // human-readable post-write note

// security.txt
generateSecurityTxt(config)             // RFC 9116 body
validateSecurityTxt(body)               // spec compliance check

// Types
type PaymentProtocolId = 'x402' | 'mpp' | 'ap2' | `x-${string}`
type AuthProtocolId    = 'agent-auth'  | `x-${string}`
type HostingPlatform   = 'cloudflare' | 'netlify' | 'vercel' | 'unknown'
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

The empty object is the support signal. The structured shape of an experimental protocol's per-protocol block in `agents.json` is the protocol author's responsibility; herald does not enforce one. Validators pass `x-` identifiers through without warning. The runtime handler is the user's responsibility (herald never implements one).

No herald edits required.

### Path 2: register the protocol in herald

When the protocol is stable and you want generators, validators, and the wizard to know about it:

1. **`packages/core/src/protocols.ts`**: append the identifier to `PAYMENT_PROTOCOLS` or `AUTH_PROTOCOLS`. One edit; validators and the CLI Zod schema follow.
2. **`packages/core/src/types.ts`**: add an interface for the protocol's config block if it has one (mirror `X402Config` / `MppConfig`). Hang it under `PaymentConfig` (or `AuthorizationConfig`) with the same key as the identifier.
3. **`packages/core/src/payments.ts`** (payments only): add `isXyzActive(payments)` and a branch in `resolveActiveProtocols`. The honest-declarations rule says the block is emitted only when the protocol can actually run.
4. **`packages/core/src/agents-txt.ts`** + **`agents-json.ts`**: the `Protocols:` line and the per-protocol object follow from `resolveActiveProtocols`, so payment protocols pick those up automatically. If the protocol carries structured fields in `agents.json`, add a per-protocol emitter inside `generateAgentsJson` next to the x402 and MPP blocks.
5. **`packages/cli/src/commands/init.ts`** (optional): add a prompt step inside the payments block if the protocol needs credentials at init.
6. **Tests**: cases under `packages/core/src/__tests__/{agents-txt,agents-json}.test.ts`.

For a brand-new block kind (not payment, not auth, not MCP, not Skills, not A2A), the A2A diff is the most recent worked example: a new `XyzConfig` interface in `types.ts`, an `Xyz:` line emitter in `agents-txt.ts`, an `xyz[]` array emitter in `agents-json.ts`, validator rules in `validate.ts`, a Zod schema entry in `config-schema.ts`, and a wizard prompt.

### Decision

When a user mentions a protocol not currently in the registry, default to Path 1. Suggest Path 2 only when the protocol has clearly settled and the user wants herald-level support.
