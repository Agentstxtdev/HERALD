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

    // OpenAPI discovery surface emitted at /openapi.json per the Payment
    // Discovery draft (paymentauth.org). One entry per payable path with
    // x-payment-info offers. Independent of the protocols[] gate above: the
    // file advertises protocol capability, not credential presence, so it
    // emits regardless of which wallets are wired.
    openapi: {
      title:   'mysite API — payable routes',
      version: '1.0.0',
      paths: {
        '/api/premium': {
          summary: 'Premium endpoint.',
          // Single-offer paths use the direct shorthand; multi-offer paths
          // use offers[]. Amounts are atomic (USDC 6 decimals → 10000 = $0.01;
          // Stripe USD 2 decimals → 1 = $0.01).
          offers: [
            { intent: 'charge', method: 'tempo',  amount: '10000', currency: '0x20c0...', description: 'USDC.e on Tempo' },
            { intent: 'charge', method: 'stripe', amount: '1',     currency: 'usd',       description: 'Stripe card or Solana USDC' },
          ],
        },
      },
    },
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
    // SEP-2127 server card emitted at /.well-known/mcp/server-card.json.
    // All three capability booleans are required by the auditor; set the
    // ones the MCP server actually exposes (false for unimplemented).
    serverCard: {
      name:    'mysite-mcp',
      version: '1.0.0',
      capabilities: { tools: true, resources: false, prompts: false },
    },
  },

  // The name / type / digest fields on each skill entry drive the
  // agentskills.io Discovery v0.2.0 index emitted at
  // /.well-known/agent-skills/index.json. Without a digest the skill still
  // appears in agents.txt / agents.json (the canonical surfaces) but is
  // skipped from the discovery index, since v0.2.0 requires verification
  // metadata for every entry.
  skills: {
    urls: {
      url: 'https://mysite.com/skills/main/SKILL.md',
      name: 'main',
      type: 'skill-md',
      digest: 'sha256:0123456789abcdef...',  // sha256sum public/skills/main/SKILL.md
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

  // Extra header rules appended verbatim to the generated `_headers` or
  // `vercel.json`. Use for custom static directories herald has no built-in
  // knowledge of: a vendored JSON Schema, an additional well-known surface,
  // anything needing CORS or a specific Content-Type. Unmatched paths are a
  // no-op at the edge, so dead entries are harmless.
  headersExtras: [
    {
      source: '/schema/*',
      headers: [
        { key: 'Content-Type',                value: 'application/json' },
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Cache-Control',               value: 'public, max-age=86400, immutable' },
      ],
    },
  ],
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
| Server framework (Express, Hono, Next.js App Router) | Run `herald emit` at build time and serve `public/` statically, or hand-roll routes that import `@herald/core` and call the generators on demand. If the route is dynamic, the handler must set `Content-Type` (with charset for the `.txt` files), `Access-Control-Allow-Origin: *`, and `Cache-Control: public, max-age=3600` itself; static-asset header config does not apply. |

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

herald emit [options]
  -c, --config <path>    Config file path (default: ./agentsjson.config.js)
  -o, --out <dir>        Output directory (default: ./public)

  # Positive selectors — pass any to emit only those files
  --robots               Emit robots.txt
  --llms                 Emit llms.txt
  --llms-full            Emit llms-full.txt (requires content.fullTxt)
  --agents               Emit agents.txt + agents.json
  --sitemap              Emit sitemap.xml (also forces emission for the firecrawl driver)
  --security             Emit /.well-known/security.txt (requires security.contact)
  --discovery            Emit the ecosystem discovery bundle:
                           /.well-known/api-catalog         (RFC 9727 linkset+json)
                           /.well-known/mcp/server-card.json (SEP-2127, needs mcp.serverCard)
                           /.well-known/agent-skills/index.json (v0.2.0, needs skill digests)
                           /openapi.json                    (Payment Discovery x-payment-info)
                         Each file inside the bundle is independently gated on its
                         source config block, following the honest-declarations rule.
  --headers              Emit §4.5 headers config (`_headers` for Cloudflare/Netlify,
                         `vercel.json` for Vercel, fallback `_headers` otherwise).
                         Includes CORS rules for any ecosystem surfaces the config
                         declares, plus an RFC 8288 `Link:` block on `/` advertising them.
  --platform <name>      Override the detected platform: cloudflare|netlify|vercel|unknown

  # Negative selectors — subtract from the selected (or default) set
  --skip-robots          Skip robots.txt
  --skip-llms            Skip llms.txt
  --skip-llms-full       Skip the Firecrawl scrape; keep llms.txt
  --skip-agents          Skip agents.txt + agents.json
  --skip-sitemap         Never emit sitemap.xml
  --skip-security        Skip security.txt
  --skip-discovery       Skip the ecosystem discovery bundle (api-catalog, mcp/server-card,
                         agent-skills/index, openapi.json)
  --skip-headers         Skip the §4.5 headers config

herald check <url>
  Fetches and scores robots.txt, llms.txt, agents.json, sitemap.xml from live URL
```

### §4.5 Headers — what gets emitted per platform

`herald emit --headers` produces:

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

## Payment protocols at a glance

Each identifier in `payments.protocols` is *advertised* in `agents.txt` / `agents.json`. This section is the guide to what each protocol is, what its on-the-wire flow looks like, and what gets surfaced in your discovery files. Herald does not implement the 402 handler; the adopter or a separate package owns the runtime.

### x402 v2: per-request crypto, on-chain settlement

x402 ([x402.org](https://x402.org/)) is HTTP-native: an agent hits a route, gets a 402 advertising acceptable payments, signs a payload, retries with the signature, and the response carries the settled receipt.

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

Agent → GET /api/content  (PAYMENT-SIGNATURE: <base64 PaymentPayload>)
         ← 200 OK
            PAYMENT-RESPONSE: <base64 SettlementResponse>
```

Verification + on-chain settlement are typically delegated to a public facilitator (e.g. `https://x402.org/facilitator`, free, no API key); payments go directly to the treasury wallet and the facilitator does not custody funds.

**Built-in USDC asset addresses** (used by `generateAgentsJson` when the operator's `x402.treasury` picks one of these chains and does not override `x402.assets`):

| Network | CAIP-2 ID | USDC contract |
|---|---|---|
| Base mainnet | `eip155:8453` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `eip155:84532` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Ethereum mainnet | `eip155:1` | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Solana mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Solana devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

For non-USDC tokens or other CAIP-2 networks, set `x402.assets[network] = '<contract>'`. The set of chains advertised in `agents.json` is exactly `x402.treasury.evmChains` plus the implied Solana network.

Migration v1→v2 reference: https://docs.x402.org/guides/migration-v1-to-v2.

### MPP: session-based, fiat + stablecoins

MPP ([mpp.dev](https://mpp.dev/), IETF `draft-ryan-httpauth-payment`) uses a challenge/credential flow over `WWW-Authenticate: Payment`. Two registered methods today: Tempo (USDC) and Stripe SPT (card networks + Solana USDC).

```
Agent → GET /api/content  (no auth header)
         ← 402 WWW-Authenticate: Payment realm="mysite.com" challenge="<id>"
            (body may also carry x402 accepts[]; agent picks one protocol)

Agent authorizes via Stripe checkout (fiat / Solana via SPT) or Tempo wallet (USDC)

Agent → GET /api/content  (Authorization: Payment <credential>)
         ← 200 OK  Payment-Receipt: <signed receipt>
```

Activation rules for the discovery emission (`payments.mpp.methods` array in `agents.json`):

- `tempo` is advertised whenever `mpp.tempoRecipient` is a 40-char `0x` EVM address.
- `stripe` is advertised whenever both `mpp.stripeSecretKey` (`sk_test_…` or `sk_live_…`) and `mpp.stripeNetworkId` (Stripe Business Network profile ID) are set.

Either method may activate independently; both may coexist in the same `methods` array. Per-method parameters (network IDs, recipient identifiers, currency codes) are not in `agents.json`: they are revealed by the 402 challenge at request time.

### AP2: mandate trust layer (composes with x402 / MPP)

AP2 ([ap2-protocol.org](https://ap2-protocol.org/)) is the Agent Payments Protocol: a verifiable-mandate layer that sits *above* the payment rail rather than replacing it. The agent presents a signed `CheckoutMandate` (what's being bought, by whom, under what limits) and a `PaymentMandate` (which payment method, for how much) as W3C Verifiable Credentials. Settlement still happens over the underlying rail (x402, MPP, or another).

```
Agent presents CheckoutMandate + PaymentMandate (signed VCs)
                ▼
       Site verifies mandates, then runs the underlying rail (x402 settle, MPP charge, etc.)
                ▼
       200 OK once both the mandate and the rail succeed
```

Setting `payments.ap2` in the config emits `payments.ap2: { presentations, spec }` in `agents.json` and adds `ap2` to the `Protocols:` line in `agents.txt`. The mandate exchange itself is the runtime contract; advertising AP2 declares the site accepts mandate-bound transactions.

Use AP2 when the business needs the auditability of explicit user authorization (mandates are signed VCs that can be replayed for dispute resolution) on top of the chosen payment rail.

### UCP: universal commerce profile discovery

UCP ([ucp.dev](https://ucp.dev/)) is a profile-based commerce discovery layer. A site publishes a UCP profile at `/.well-known/ucp` (or any path it declares) that describes its services, capabilities (e.g. `dev.ucp.shopping.ap2_mandate`), payment handlers (which rails it speaks), and signing keys.

```
Agent → GET /.well-known/ucp
         ← UCP profile {
              services: [...],
              capabilities: ['dev.ucp.shopping.ap2_mandate', ...],
              payment_handlers: [{ protocol: 'x402', ... }, { protocol: 'mpp', ... }],
              signing_keys: [...]
            }

Agent picks a capability + handler, then runs the corresponding rail.
```

Set `ucp.profiles` in `agentsjson.config.js` and herald emits the profile URL(s) into `agents.txt` (`UCP:` directive) and `agents.json` (`ucp[]` array). The profile document itself is served separately (typically a static JSON file the operator authors or generates themselves); herald does not produce the profile body, only the discovery pointer to it.

### Trust model at a glance: x402 vs MPP

Both protocols can move USDC (and Stripe SPT can route Solana USDC under the hood), but they differ in who holds keys, who signs the transfer, and where settlement happens. Picking which protocols to advertise is a trust-model decision, not just a payment-rail decision:

| Protocol | Method | Who holds keys | Who signs the transfer | Where settlement happens |
|---|---|---|---|---|
| **x402 v2** | EVM or Solana | Agent holds its own private key | Agent signs the full transfer (EIP-3009 on EVM, SPL on Solana) | Public facilitator submits the agent-signed payload; on-chain |
| **MPP** | `tempo` | Agent holds its own Tempo wallet key | Agent signs the TIP-20 transfer | On Tempo chain |
| **MPP** | `stripe` | Stripe holds keys on both sides (custody) | Stripe internal | Stripe Payments Network; agent never signs an on-chain tx, even when SPT routes to Solana USDC |

Two practical consequences:

1. **Stripe SPT can settle in Solana USDC without involving any wallet on either side.** The agent presents a Stripe customer credential (no chain identity at all), Stripe processes the payment using its internal Solana USDC reserves, and the merchant receives a Stripe deposit. Same asset as x402-on-Solana, completely different trust model.
2. **A site declaring both rails reaches strictly more agents than one declaring either alone.** Wallet-native agents pay x402 (they have keys, no Stripe customer). Customer-credential agents pay MPP/Stripe (they have a Stripe account, no chain identity). The two populations barely overlap.

### What lives in `agents.json` vs. `402` responses

| Field | Where it lives | Why |
|---|---|---|
| `payments.x402` (object) | `agents.json` | Presence signals x402 support; agents pre-check protocol availability |
| `payments.mpp` (object) | `agents.json` | Presence signals MPP support; same pre-check role as x402 |
| `payments.ap2` (object) | `agents.json` | Presence signals mandate-bound payments are accepted |
| `payments.x402.chains` | `agents.json` | Agents verify chain compatibility before paying |
| `payments.mpp.methods` | `agents.json` | Configured methods (`tempo`, `stripe`); pre-screening without hitting the 402 |
| `payments.pricing` | `agents.json` | Agents pre-screen affordability |
| `payments.required` (optional) | `agents.json` and `agents.txt` | Site-level policy: every interaction requires payment, no free path |
| Wallet addresses (`evmAddress`, `solanaAddress`, `tempoRecipient`) | `402` responses only | Security: never in discovery files |
| Stripe keys, API keys, MPP secret key | Server env only | Never in any output |

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
generateSecurityTxt(config)                 → string | null
generateApiCatalog(config)                  → string         // RFC 9727 linkset+json
generateMcpServerCard(config)               → string | null  // SEP-2127; null when mcp.serverCard absent
generateAgentSkillsIndex(config)            → string | null  // v0.2.0 index; null when no skill has a digest
generateOpenApiJson(config)                 → string | null  // Payment Discovery x-payment-info
generateHeadersFile(platform, config?)      → HeadersFile    // §4.5 + ecosystem CORS + Link headers on /

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

// Hosted JSON Schema reference
AGENTS_JSON_SCHEMA_URL                  // 'https://agents-txt.com/schema/agents-json/v1.0.json'
                                        // Injected as `$schema` at the top of every generated agents.json
                                        // so editors (VS Code, JetBrains, jq --schema) read it for autocomplete
```

Zero runtime dependencies, safe on Node.js, edge runtimes, Deno, Bun.

---

## `@herald/schema` Key Exports

The Zod source of truth for the agents.json wire format. Lives in its own package because Zod is a runtime dependency `@herald/core` cannot accept.

```ts
// Runtime validation + types
import { AgentsJsonSchema, type AgentsJson } from '@herald/schema'

AgentsJsonSchema.safeParse(json)          // { success: true, data: AgentsJson } | { success: false, error }
AgentsJsonSchema.parse(json)              // throws on invalid input

// JSON Schema derivation (the document hosted at agents-txt.com/schema/agents-json/v1.0.json)
toJsonSchema()                            // Record<string, unknown>: JSON Schema 2020-12 document
toJsonSchemaString()                      // string: same, JSON.stringify with 2-space indent + trailing newline

// Identity
SCHEMA_VERSION                            // '1.0' (current wire-format version)
SCHEMA_ID                                 // 'https://agents-txt.com/schema/agents-json/v1.0.json'
```

CLI entry: `pnpm --filter @agentstxtdev/herald-schema emit:json-schema <out-dir>` writes `agents-json/v<VERSION>.json` to the given directory. Used by the agents-txt.com reference deployment to keep the public schema file in sync with the Zod source.

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
