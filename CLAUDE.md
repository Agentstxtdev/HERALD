# Project: herald

A framework that makes any website readable and (optionally) monetizable by AI agents. One npm install. One config object. Five files generated (`robots.txt`, `sitemap.xml`, `llms.txt`, `agents.txt`, `agents.json`) plus an optional payment middleware (`x402 v2 + MPP`) on top.

## Skills

Use `/agents-txt-setup` when helping a user integrate `herald` into their own site. The skill walks Claude through diagnosing the user's framework, configuring `agentsjson.config.js`, running the CLI commands, and wiring the middleware, with inline gotchas.

- [agents-txt-setup SKILL.md](skills/agents-txt-setup/SKILL.md): Claude's operating instructions for guiding setup
- [agents-txt-setup REFERENCE.md](skills/agents-txt-setup/REFERENCE.md): full config schema, middleware snippets, CLI flags, package sub-paths, payment flows, core API

## Monorepo Layout

```
herald/
├── packages/
│   ├── core/    — @herald/core  — pure generators, zero runtime deps
│   ├── web/     — @herald/addon   — Express / Hono / Next.js adapters + payment middleware
│   └── cli/     — @herald/cli  — herald CLI (Commander.js)
├── examples/
│   ├── express/ — working Express server
│   └── nextjs/  — working Next.js App Router app
├── docs/        — changelogs
├── skills/      — agent-installable skill packages
├── ref/         — third-party protocol references for development (mppx, x402, machine-payments)
└── tsconfig.base.json
```

## Tech Stack

- **Language**: TypeScript 6, ES2022 target, NodeNext module resolution, strict mode
- **Package manager**: pnpm workspaces (`pnpm-workspace.yaml`)
- **Module system**: All packages are pure ESM (`"type": "module"`)
- **CLI framework**: Commander.js
- **Validation**: Zod v4 (CLI only, keeps core dep-free)
- **Node requirement**: >=20.12.0
- **Payment protocols**: x402 v2 (crypto, per-request, implemented directly against the public facilitator at `https://x402.org/facilitator`, no `@x402/*` SDK), MPP / `mppx` (fiat + USDC, session-based, Tempo + Stripe SPT)

## Commands

```bash
# Root — runs across all packages
pnpm build        # turbo run build → tsup per package (core first, then web + cli)
pnpm dev          # watch mode in parallel
pnpm typecheck    # tsc --noEmit in every package
pnpm clean        # rm -rf dist in every package

# CLI — try without installing
herald init               # interactive wizard → agentsjson.config.js
herald generate --out ./public   # writes robots.txt, sitemap.xml, llms.txt, agents.txt, agents.json
herald check https://mysite.com  # live compliance audit
```

## Setup from Scratch

```bash
# 1. Install
cd herald
pnpm install

# 2. Build all packages (core first — web and cli depend on it)
pnpm build

# 3. Run the CLI locally
node packages/cli/dist/cli.js init
```

> **Note:** pnpm workspace links resolve `@herald/core` via `workspace:*`. Build `core`
> before `web` or `cli`, or run `pnpm build` from root which uses `-r` (recursive) ordering.

## The Single Config Object

Everything flows from `AgenticConfig` (defined in `packages/core/src/types.ts`):

```ts
interface AgenticConfig {
  site:           { name, url, description }
  content?:       { driver: LlmsDriver }   // sitemap | firecrawl | static | manual
  crawlers?:      { blockFreeAiScrapers, allowSearchEngines, allowPaidAgents }
  payments?:      { protocols, required?, x402?, mpp?, exemptUserAgents? }
  authorization?: { enabled, protocols?, identityRequired? }
  mcp?:           { endpoints }
  skills?:        { urls }
  a2a?:           { cards }            // A2A AgentCard URLs (a2a-protocol.org)
}
```

`payments.protocols` accepts the registered identifiers (`'x402'`, `'mpp'`) and any experimental identifier prefixed with `x-` (e.g. `'x-mypay'`) per agents.txt spec §3.1. Same convention for `authorization.protocols`. The set of identifiers comes from `@herald/core`'s `protocols.ts` registry, which is the single source of truth.

Users write `agentsjson.config.js` once. Every generator and middleware adapter reads from it.

## Package: `@herald/core`

**Zero runtime dependencies.** Safe to use in Node.js, edge runtimes, Deno, Bun.

Key exports:

| Function | What it does |
|---|---|
| `generateRobotsTxt(config, existingContent?)` | RFC 9309 robots.txt with AI crawler rules + Agents-Txt + Content-Signal |
| `generateLlmsTxt(config, driver?)` | llmstxt.org spec from sitemap / Firecrawl / static |
| `generateLlmsFullTxt(config)` | llms-full.txt expanded companion (inlines page content via Firecrawl scrape) |
| `generateAgentsTxt(config)` | agents.txt: Layer 4 agent capabilities declaration |
| `generateAgentsJson(config)` | agents.json: structured JSON companion to agents.txt |
| `generateSitemapXml(pages)` | sitemaps.org 0.9 sitemap.xml from a `PageEntry[]` |
| `validateRobotsTxt / validateLlmsTxt / validateAgentsTxt / validateAgentsJson / validateSitemapXml` | Spec compliance checks on generated output |
| `sitemapDriver / firecrawlDriver / staticDriver / manualDriver` | ContentDriver factories (inject in tests) |

## Package: `@herald/addon`

Framework adapters behind sub-path exports (only pull in what you use):

```
@herald/addon          → core + x402 utils + mpp utils + payment-gate
@herald/addon/express  → Express adapter  (peer: express, mppx, stripe)
@herald/addon/hono     → Hono adapter     (peer: hono,    mppx, stripe)
@herald/addon/nextjs   → Next.js adapter  (peer: next,    mppx, stripe)
@herald/addon/dev      → Dev-server §4.5 headers shim (Vite plugin, Connect, Hono)
```

The three adapters are thin shells: they convert the framework-specific
request/response into a Web `Request`, call the shared `gateRequest()`
fetch-style entry point, and write the result back. All payment logic lives
in [packages/web/src/payment-gate.ts](packages/web/src/payment-gate.ts).

**Express quick start:**
```ts
import { createAgenticRouter, agenticPaymentMiddleware } from '@herald/addon/express'
app.use(createAgenticRouter(config))          // serves /robots.txt, /llms.txt, /agents.txt, /agents.json
app.use('/api', agenticPaymentMiddleware(config, '/api'))  // gates /api/* behind x402 + MPP
```

**Next.js quick start (App Router):**
```ts
// app/robots.txt/route.ts → export const GET = robotsTxtHandler(config)
// app/llms.txt/route.ts   → export const GET = llmsTxtHandler(config)
// app/agents.txt/route.ts → export const GET = agentsTxtHandler(config)
// app/agents.json/route.ts → export const GET = agentsJsonHandler(config)
// middleware.ts — edge payment gate
export default createPaymentProxy(config, '/api')
```

**No `@x402/*` SDK dependency.** We implement x402 v2 directly against the
public facilitator at `https://x402.org/facilitator`. The `@x402/*` packages
exist but they're v1-style middlewares that own a different decision flow than
ours; using them would force the gate to forfeit MPP-before-x402 ordering.

## Package: `@herald/cli`

```
packages/cli/src/
├── cli.ts            — Commander entry: init | generate | check
├── project-probe.ts  — detectProject(): reads package.json, .env, scans for sitemap
├── config-writer.ts  — buildAgenticConfigContent() + writeAgenticConfig()
├── config-schema.ts  — Zod v4 schema for AgenticConfig (CLI-only — keeps core dep-free)
└── commands/
    ├── init.ts       — readline wizard (orchestrates probe + writer)
    ├── generate.ts   — validates config via Zod, writes files, runs spec validators
    └── check.ts      — fetches live site, scores compliance
```

**`init` wizard flow:**
1. `detectProject()`: reads `package.json`, `.env*`, scans for `sitemap.xml`, detects framework
2. readline prompts pre-filled with detected values (or `-y` to skip all)
3. `writeAgenticConfig(path, choices)` → writes `agentsjson.config.js`

**`generate` flow:**
1. Dynamic `import()` of `agentsjson.config.js`
2. Zod validation with field-level error paths. Per-field lenient on optional wallets: `evmAddress`, `solanaAddress`, and `stripeSecretKey` keep their strict format checks (regex / min length / `sk_` prefix), but a malformed value `.catch()`es to `undefined` with a `console.warn` instead of aborting the whole parse. The `treasury` refine then ensures at least one wallet survived.
3. `generateRobotsTxt` / `generateLlmsTxt` / `generateAgentsTxt` / `generateAgentsJson` / `generateSitemapXml` (per the file's emission policy; see [README.md](README.md) for the sitemap rules) → writes to `--out` dir (default: `./public`). Per-protocol chain emission in `agents.json` is gated on the surviving wallets: `evmChains` only when `evmAddress` is set, Solana chains only when `solanaAddress` is set.
4. Runs spec validators inline, prints warnings but does not fail the build

Per-file flags come in two symmetric sets. Default mode emits everything applicable to the config; pass any positive selector to narrow to that set; `--skip-*` subtracts from whichever set is selected.

- Positive selectors: `--robots`, `--llms`, `--llms-full`, `--agents`, `--sitemap` (also forces emission for the `firecrawl` driver; warns + skips for the `sitemap` driver), `--headers` (emits the §4.5 deployment config for the detected hosting platform; `--platform <cloudflare|netlify|vercel|unknown>` overrides the probe)
- Negative selectors: `--skip-robots`, `--skip-llms`, `--skip-llms-full`, `--skip-agents`, `--skip-sitemap`, `--skip-headers`

The `--headers` flag delegates to `@herald/core/src/headers.ts` (`generateHeadersFile(platform)`, `mergeVercelHeaders()`); the platform comes from `detectProject().hostingPlatform`. After the file is written, the CLI also calls `headersDevSnippet(detectProject().framework)` from `@herald/core` and prints the framework-specific dev-parity snippet under `Dev parity (detected: <framework>)`. The shim itself lives in `@herald/addon/dev` (Vite plugin / Connect middleware / Hono middleware that read `public/_headers` or `vercel.json` at request time); Next.js is intentionally routed at the native `next.config.js` `async headers()` API rather than a herald shim. Auto-generation is implemented for Cloudflare and Netlify (a `_headers` file in `--out`) and Vercel (a `vercel.json` at the project root with merge semantics). Other platforms (nginx, Apache, Caddy, S3+CloudFront, etc.) get the `unknown` fallback `_headers` plus a console note pointing at the README's per-platform table; herald deliberately does not write into `/etc/` or external IaC trees.

**`check` command:**
```bash
herald check https://mysite.com
```
Fetches `robots.txt`, `llms.txt`, `agents.txt`, `agents.json`, `sitemap.xml` and scores them using the same validators as `generate`.

## Content Drivers

The `content.driver` discriminated union controls how `generateLlmsTxt` discovers pages:

| Type | When to use | Config required |
|---|---|---|
| `sitemap` | Site has `/sitemap.xml` | `sitemapUrl` |
| `firecrawl` | Richer output with titles + grouping | `siteUrl`, `apiKey` (free at firecrawl.dev) |
| `static` | Jamstack / no crawl needed | `pages[]` + optional `sections[]` |
| `manual` | Full control over llms.txt sections | `sections[]` |

To inject a driver in tests: `generateLlmsTxt(config, staticDriver(pages))`

## Payment Protocols

### x402 v2 (crypto, per-request)
- Agent hits gated route → `402` with body `{ x402Version: 2, accepts: PaymentRequirements[], resource, ... }`
- `accepts[]` carries `{ scheme: 'exact', network (CAIP-2), amount (atomic), asset, payTo, maxTimeoutSeconds, extra }`
- Agent retries with `PAYMENT-SIGNATURE` header (base64 JSON); also accepts legacy `X-Payment` for v1 clients
- Server posts `{ x402Version: 2, paymentPayload, paymentRequirements }` to the facilitator's `/settle` endpoint (default `https://x402.org/facilitator`, free, no API key)
- On success the server attaches `PAYMENT-RESPONSE: <base64 SettlementResponse>` to the verified response
- Treasury config: `evmAddress` (EVM) + `evmChains` (CAIP-2), `solanaAddress` + `solanaNetwork`. USDC contract addresses default per-network (override via `x402.assets`).
- Migration guide: https://docs.x402.org/guides/migration-v1-to-v2

### MPP (fiat + stablecoins, session-based; IETF draft-ryan-httpauth-payment)
- Server sends `402` with `WWW-Authenticate: Payment realm="…" challenge=<id>` (built by `mppx`)
- The single 402 simultaneously carries the x402 `accepts[]` body and the MPP `WWW-Authenticate` challenge; agents pick whichever protocol they support
- Agent retries with `Authorization: Payment <credential>`
- Server runs `Mppx.compose(tempo.charge, stripe.charge)(request)` per-request → either re-issues 402 or returns a verified response with a `Payment-Receipt` header
- `mppx` (Tempo USDC + Stripe SPT) is the only MPP runtime; if it's not installed the gate falls back to x402-only

### Gate decision order (all adapters, see `payment-gate.ts`)
```
1. Exempt user-agent → pass through
2. `Authorization: Payment …` + MPP configured → mppx verify (compose(tempo, stripe))
3. `PAYMENT-SIGNATURE` (or `X-Payment`) + x402 configured → facilitator settle
4. No credential → emit a single 402 carrying both x402 accepts[] and MPP WWW-Authenticate
```
The gate is a pure async function `gateRequest(request: Request, opts) → GateResult`,
returning `{ kind: 'pass' }`, `{ kind: 'pass-with-headers', headers }`, or
`{ kind: 'respond', response }`.

## Code Conventions

- Named exports throughout; no default exports except framework adapters and generated configs
- All packages: `"type": "module"`, `.js` extensions on all relative imports (NodeNext requirement)
- No comments unless the WHY is non-obvious
- Zod validation only in CLI; never import Zod into `@herald/core`
- `s(value)` helper in `config-writer.ts`: always use it for string injection into config templates (JSON.stringify-based injection prevention)
- `createMppxRuntime(mppConfig, realm)` in `mpp.ts`: single entry that builds `Mppx.create({...})` and exposes `runtime.charge(request, { tempoAmount, stripeAmount })` (compose-backed). Don't load `mppx/server` directly from adapters.
- `gateRequest(request, opts)` in `payment-gate.ts`: the only place the protocol decision lives. Adapters never re-implement it.

## Boundaries

- Never add runtime dependencies to `@herald/core`; it must stay edge-runtime compatible
- Never re-implement the gate logic in an adapter; call `gateRequest()` and adapt the `GateResult`
- Never add Zod to `packages/core` or `packages/web`
- Never commit `.env` files or wallet private keys
- Run `pnpm typecheck` before committing; `strict: true` + `exactOptionalPropertyTypes` catches subtle bugs

## Open follow-ups

- **Paid agentic crawler UA convention.** `PAID_AGENTIC_AGENTS` in [`packages/core/src/robots.ts`](packages/core/src/robots.ts) is intentionally empty. The previous default (`AgentstxtBot`) was self-referential — the only client identifying with that UA was herald's own `check` command, and shipping an invented bot name in every adopter's `robots.txt` looked confusing. Adopters who want to admit a specific paid crawler can use `crawlers.additionalAllowList`. Re-add a canonical identifier here when an ecosystem-wide UA convention emerges in the wild (a real client crawling sites with that UA, not just a herald-side declaration). At that point, also restore the `herald-check` UA in `packages/cli/src/commands/check.ts` to whatever the canonical name becomes, so the audit tool's traffic looks like a real consumer rather than a tool with a private UA.

## Adding a New Framework Adapter

1. Create `packages/web/src/<framework>.ts`
2. Convert the framework's request → Web `Request`, call `gateRequest(request, { config, pathPrefix })`
3. On `'pass'` → invoke next; on `'pass-with-headers'` → invoke next + attach headers; on `'respond'` → write the returned `Response`
4. Add sub-path export to `packages/web/package.json`
5. The framework runtime is the only new peer dep; `mppx` and `stripe` already cover payments

## Adding a New Content Driver

**Config-driven (visible in `agentsjson.config.js`):**
1. Add variant to `LlmsDriver` in `packages/core/src/types.ts`
2. Handle the new `type` in `resolveContent()` in `packages/core/src/llms.ts`
3. Export factory from `packages/core/src/sitemap.ts`
4. Add auto-detection to `detectProject()` in `packages/cli/src/project-probe.ts`

**Library / test use only:**
```ts
const myDriver: ContentDriver = { resolve: async () => [{ name: 'Pages', pages: [...] }] }
const llmsTxt = await generateLlmsTxt(config, myDriver)
```

## Adding a New Protocol

Two paths. Pick by stability.

**Path 1: experimental (`x-` prefix), no herald changes.** When a user wants to advertise a protocol that has not been registered in the spec yet, they declare it with an `x-` prefix in `agentsjson.config.js`:

```js
payments: { protocols: ['x402', 'x-mypay'], x402: { /* ... */ } }
authorization: { enabled: true, protocols: ['agent-auth', 'x-myauth'] }
```

The identifier flows through to `agents.txt` (`Protocols: x402, x-mypay`) and `agents.json` (`payments['x-mypay']: {}`). Validators do not warn on it. The gate middleware ignores it; the user runs their own runtime handler. No herald edits are required.

**Path 2: register the protocol in herald.** When the protocol has settled and we want generators, validators, the wizard, and (for payments) the gate to know about it:

1. **Registry** ([`packages/core/src/protocols.ts`](packages/core/src/protocols.ts)): append the identifier to `PAYMENT_PROTOCOLS` or `AUTH_PROTOCOLS`. This single edit propagates to validators, the CLI Zod schema, and the audit tool via `isAcceptedPaymentIdentifier` / `isAcceptedAuthIdentifier`.
2. **Types** ([`packages/core/src/types.ts`](packages/core/src/types.ts)): if the protocol has its own configuration block, add an interface (mirror `X402Config` / `MppConfig`). Hang it under `PaymentConfig` (or `AuthorizationConfig`) with the same key as the identifier.
3. **Activity check** ([`packages/core/src/payments.ts`](packages/core/src/payments.ts), payments only): add an `isXyzActive(payments)` helper and a branch in `resolveActiveProtocols`. The "honest declarations" rule means the block is emitted only when the protocol can actually run.
4. **Generators** ([`packages/core/src/agents-txt.ts`](packages/core/src/agents-txt.ts), [`agents-json.ts`](packages/core/src/agents-json.ts)): the `Protocols:` line and the per-protocol object are driven by `resolveActiveProtocols`, so payment protocols pick those up automatically once steps 1 and 3 are in place. If the protocol carries structured fields in `agents.json`, add a per-protocol emitter inside `generateAgentsJson`.
5. **Middleware** ([`packages/web/src/payment-gate.ts`](packages/web/src/payment-gate.ts), payments only, optional): add a credential check before the existing protocol checks, and a challenge emitter in the unauthenticated 402 path. The gate is the only place protocol routing lives; adapters do not need to change.
6. **CLI wizard** ([`packages/cli/src/commands/init.ts`](packages/cli/src/commands/init.ts), optional): add a prompt step inside the payments block when the new protocol needs credentials.
7. **Tests**: add cases under `packages/core/src/__tests__/{agents-txt,agents-json}.test.ts` for emission with and without credentials.

For a brand-new block kind (not payment, not auth, not MCP, not Skills, not A2A): the A2A diff is the most recent worked example. Add a new `XyzConfig` type, parser case if the tool reads agents.txt, `Xyz:` line emitter in `agents-txt.ts`, `xyz[]` array emitter in `agents-json.ts`, validator rules in `validate.ts`, Zod schema entry in `config-schema.ts`, and a wizard prompt.

When the user mentions a new protocol that does not yet exist in `protocols.ts`, default to Path 1 (the `x-` prefix). Only suggest Path 2 if the protocol is clearly settled and the user wants herald-level support. Never silently extend `PAYMENT_PROTOCOLS` / `AUTH_PROTOCOLS` without confirming the spec status.

## Key Design Decisions (Why, Not What)

- **Single config object**: one source of truth for generators and middleware; users configure once
- **Core has zero deps**: safe on edge runtimes; Zod stays in CLI only
- **We hand-roll x402 v2**: tiny direct facilitator client (no `@x402/*` SDK) keeps the gate framework-agnostic and avoids v1↔v2 SDK drift; the facilitator still handles cryptographic verification + on-chain settlement
- **One gate, many adapters**: `gateRequest()` is the only place the decision lives; framework files are <100 lines each
- **Single 402 carries both protocols**: x402 `accepts[]` (body) + MPP `WWW-Authenticate` (header) emitted together; agent picks one. MPP credential check (`Authorization: Payment …`) runs first so a holding agent is never rebounced through x402.
- **Two validation layers with different purposes**: core validates generated *output* (spec compliance); CLI validates *input* (Zod schema on AgenticConfig before generation)
- **agents.txt is Layer 4**: plain-text capabilities declaration; wallet/pricing details stay in 402 responses, not in the discovery file
