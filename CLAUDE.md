# Project: herald

A file-generation framework that makes any website readable and agent-discoverable. One npm install (`@herald/cli`). One config object. Up to six files generated (`robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `agents.txt`, `agents.json`) plus `_headers` / `vercel.json` for spec §4.5 compliance. The `agents.txt` and `agents.json` outputs *declare* payment, auth, MCP, Skills, A2A, and UCP capabilities; herald does not implement the runtime handlers for any of those protocols.

## Skills

Use `/agents-txt-setup` when helping a user integrate `herald` into their own site. The skill walks Claude through diagnosing the user's framework, configuring `agentsjson.config.js`, and running the CLI commands.

- [agents-txt-setup SKILL.md](skills/agents-txt-setup/SKILL.md): Claude's operating instructions for guiding setup
- [agents-txt-setup REFERENCE.md](skills/agents-txt-setup/REFERENCE.md): full config schema, CLI flags, and core API

## Monorepo Layout

```
herald/
├── packages/
│   ├── core/    — @herald/core  — pure generators, zero runtime deps
│   └── cli/     — @herald/cli   — herald CLI (Commander.js)
├── docs/        — changelogs
├── skills/      — agent-installable skill packages
└── tsconfig.base.json
```

## Tech Stack

- **Language**: TypeScript 6, ES2022 target, NodeNext module resolution, strict mode
- **Package manager**: pnpm workspaces (`pnpm-workspace.yaml`)
- **Module system**: All packages are pure ESM (`"type": "module"`)
- **CLI framework**: Commander.js
- **Validation**: Zod v4 (CLI only, keeps core dep-free)
- **Node requirement**: >=20.12.0

## Commands

```bash
# Root — runs across all packages
pnpm build        # turbo run build → tsup per package (core first, then cli)
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

# 2. Build all packages (core first — cli depends on it)
pnpm build

# 3. Run the CLI locally
node packages/cli/dist/cli.js init
```

> **Note:** pnpm workspace links resolve `@herald/core` via `workspace:*`. Build `core`
> before `cli`, or run `pnpm build` from root which uses `-r` (recursive) ordering.

## The Single Config Object

Everything flows from `AgenticConfig` (defined in `packages/core/src/types.ts`):

```ts
interface AgenticConfig {
  site:           { name, url, description }
  content?:       { driver: LlmsDriver }   // sitemap | firecrawl | static | manual
  crawlers?:      { blockFreeAiScrapers, allowSearchEngines, allowPaidAgents }
  payments?:      { protocols, required?, x402?, mpp?, ap2?, exemptUserAgents? }
  authorization?: { enabled, protocols?, identityRequired? }
  mcp?:           { endpoints }
  skills?:        { urls }
  a2a?:           { cards }
  ucp?:           { profiles }
  security?:      { contact, policy?, preferredLanguages? }
}
```

`payments.protocols` accepts the registered identifiers (`'x402'`, `'mpp'`, `'ap2'`) and any experimental identifier prefixed with `x-` (e.g. `'x-mypay'`) per agents.txt spec §3.1. Same convention for `authorization.protocols`. The set of identifiers comes from `@herald/core`'s `protocols.ts` registry, which is the single source of truth.

Users write `agentsjson.config.js` once. Every generator reads from it.

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
| `generateSecurityTxt(config)` | RFC 9116 `security.txt` for `/.well-known/security.txt` |
| `generateHeadersFile(platform)` / `mergeVercelHeaders()` | §4.5 platform headers config (`_headers` or `vercel.json`) |
| `validateRobotsTxt / validateLlmsTxt / validateAgentsTxt / validateAgentsJson / validateSitemapXml / validateSecurityTxt` | Spec compliance checks on generated output |
| `sitemapDriver / firecrawlDriver / staticDriver / manualDriver` | ContentDriver factories (inject in tests) |

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
3. `generateRobotsTxt` / `generateLlmsTxt` / `generateAgentsTxt` / `generateAgentsJson` / `generateSitemapXml` / `generateSecurityTxt` (per the file's emission policy; see [README.md](README.md) for the sitemap rules) → writes to `--out` dir (default: `./public`). Per-protocol chain emission in `agents.json` is gated on the surviving wallets: `evmChains` only when `evmAddress` is set, Solana chains only when `solanaAddress` is set.
4. Runs spec validators inline, prints warnings but does not fail the build

Per-file flags come in two symmetric sets. Default mode emits everything applicable to the config; pass any positive selector to narrow to that set; `--skip-*` subtracts from whichever set is selected.

- Positive selectors: `--robots`, `--llms`, `--llms-full`, `--agents`, `--sitemap` (also forces emission for the `firecrawl` driver; warns + skips for the `sitemap` driver), `--security`, `--headers` (emits the §4.5 deployment config for the detected hosting platform; `--platform <cloudflare|netlify|vercel|unknown>` overrides the probe)
- Negative selectors: `--skip-robots`, `--skip-llms`, `--skip-llms-full`, `--skip-agents`, `--skip-sitemap`, `--skip-security`, `--skip-headers`

The `--headers` flag delegates to `@herald/core/src/headers.ts` (`generateHeadersFile(platform)`, `mergeVercelHeaders()`); the platform comes from `detectProject().hostingPlatform`. Auto-generation is implemented for Cloudflare and Netlify (a `_headers` file in `--out`) and Vercel (a `vercel.json` at the project root with merge semantics). Other platforms (nginx, Apache, Caddy, S3+CloudFront, etc.) get the `unknown` fallback `_headers` plus a console note pointing at the README's per-platform table; herald deliberately does not write into `/etc/` or external IaC trees. Localhost dev-server parity is not herald's responsibility; production hosts apply the generated file at their edge.

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

## Payment Capability Declaration

Herald does not implement payment runtime; it generates the *declaration* layer that agents read to discover what the site supports. The `payments` block in `agentsjson.config.js` flows into:

- `agents.txt`: `Protocols:` line listing registered identifiers (`x402`, `mpp`, `ap2`) plus any `x-` experimental ones the user added
- `agents.json`: per-protocol objects under `payments.{x402,mpp,ap2,...}` carrying `pricing` (advertised default amount + token), x402 `chains` (CAIP-2), MPP `methods` (`['tempo', 'stripe']`), and optionally `payments.required` as a site-level policy hint

Wallet addresses, API keys, and secret keys never appear in the discovery files. Those values are operator runtime config; herald embeds only the receiving wallet's *public* address into `agents.json` if the operator declares one, otherwise omits the field. The 402 handler, signature verification, and on-chain settlement are out of scope for this project.

The "honest declarations" rule (`packages/core/src/payments.ts → resolveActiveProtocols`) governs emission: a per-protocol block is written only when the necessary fields in `AgenticConfig.payments.<protocol>` are present. An adopter who lists `'mpp'` in `protocols` but never sets `mpp.tempoRecipient` or Stripe credentials sees the protocol dropped from both files at generate time, with a console warning.

## Code Conventions

- Named exports throughout; no default exports except generated configs
- All packages: `"type": "module"`, `.js` extensions on all relative imports (NodeNext requirement)
- No comments unless the WHY is non-obvious
- Zod validation only in CLI; never import Zod into `@herald/core`
- `s(value)` helper in `config-writer.ts`: always use it for string injection into config templates (JSON.stringify-based injection prevention)

## Boundaries

- Never add runtime dependencies to `@herald/core`; it must stay edge-runtime compatible
- Never add Zod to `packages/core`
- Never ship runtime middleware (402 handlers, framework adapters) from herald
- Never commit `.env` files or wallet private keys
- Run `pnpm typecheck` before committing; `strict: true` + `exactOptionalPropertyTypes` catches subtle bugs

## Open follow-ups

- **Paid agentic crawler UA convention.** `PAID_AGENTIC_AGENTS` in [`packages/core/src/robots.ts`](packages/core/src/robots.ts) is intentionally empty. The previous default (`AgentstxtBot`) was self-referential — the only client identifying with that UA was herald's own `check` command, and shipping an invented bot name in every adopter's `robots.txt` looked confusing. Adopters who want to admit a specific paid crawler can use `crawlers.additionalAllowList`. Re-add a canonical identifier here when an ecosystem-wide UA convention emerges in the wild (a real client crawling sites with that UA, not just a herald-side declaration). At that point, also restore the `herald-check` UA in `packages/cli/src/commands/check.ts` to whatever the canonical name becomes, so the audit tool's traffic looks like a real consumer rather than a tool with a private UA.

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

The identifier flows through to `agents.txt` (`Protocols: x402, x-mypay`) and `agents.json` (`payments['x-mypay']: {}`). Validators do not warn on it. The runtime handler is the user's responsibility; herald only emits the declaration.

**Path 2: register the protocol in herald.** When the protocol has settled and we want generators, validators, and the wizard to know about it:

1. **Registry** ([`packages/core/src/protocols.ts`](packages/core/src/protocols.ts)): append the identifier to `PAYMENT_PROTOCOLS` or `AUTH_PROTOCOLS`. This single edit propagates to validators, the CLI Zod schema, and the audit tool via `isAcceptedPaymentIdentifier` / `isAcceptedAuthIdentifier`.
2. **Types** ([`packages/core/src/types.ts`](packages/core/src/types.ts)): if the protocol has its own configuration block, add an interface (mirror `X402Config` / `MppConfig`). Hang it under `PaymentConfig` (or `AuthorizationConfig`) with the same key as the identifier.
3. **Activity check** ([`packages/core/src/payments.ts`](packages/core/src/payments.ts), payments only): add an `isXyzActive(payments)` helper and a branch in `resolveActiveProtocols`. The "honest declarations" rule means the block is emitted only when the protocol can actually run.
4. **Generators** ([`packages/core/src/agents-txt.ts`](packages/core/src/agents-txt.ts), [`agents-json.ts`](packages/core/src/agents-json.ts)): the `Protocols:` line and the per-protocol object are driven by `resolveActiveProtocols`, so payment protocols pick those up automatically once steps 1 and 3 are in place. If the protocol carries structured fields in `agents.json`, add a per-protocol emitter inside `generateAgentsJson`.
5. **CLI wizard** ([`packages/cli/src/commands/init.ts`](packages/cli/src/commands/init.ts), optional): add a prompt step inside the payments block when the new protocol needs credentials.
6. **Tests**: add cases under `packages/core/src/__tests__/{agents-txt,agents-json}.test.ts` for emission with and without credentials.

For a brand-new block kind (not payment, not auth, not MCP, not Skills, not A2A, not UCP): the A2A diff is the most recent worked example. Add a new `XyzConfig` type, parser case if the tool reads agents.txt, `Xyz:` line emitter in `agents-txt.ts`, `xyz[]` array emitter in `agents-json.ts`, validator rules in `validate.ts`, Zod schema entry in `config-schema.ts`, and a wizard prompt.

When the user mentions a new protocol that does not yet exist in `protocols.ts`, default to Path 1 (the `x-` prefix). Only suggest Path 2 if the protocol is clearly settled and the user wants herald-level support. Never silently extend `PAYMENT_PROTOCOLS` / `AUTH_PROTOCOLS` without confirming the spec status.

## Key Design Decisions (Why, Not What)

- **Single config object**: one source of truth for all generators; users configure once
- **Core has zero deps**: safe on edge runtimes; Zod stays in CLI only
- **Declaration only**: herald generates the discovery files that *advertise* payment and auth support. The 402 handler, signature verification, and settlement are out of scope and live in whatever middleware the adopter wires up
- **Two validation layers with different purposes**: core validates generated *output* (spec compliance); CLI validates *input* (Zod schema on AgenticConfig before generation)
- **agents.txt is Layer 4**: plain-text capabilities declaration; wallet/pricing details that are runtime concerns (signatures, full token contracts, secret keys) stay in 402 responses, not in the discovery file
