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
│   ├── core/    — @herald/core    — pure generators, zero runtime deps
│   ├── cli/     — @herald/cli     — herald CLI (Commander.js)
│   └── schema/  — @herald/schema  — Zod source of truth for agents.json + JSON Schema export
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
herald emit --out ./public   # writes robots.txt, sitemap.xml, llms.txt, agents.txt, agents.json
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
  payments?:      { protocols, required?, x402?, mpp?, ap2?, exemptUserAgents?, openapi? }
  authorization?: { enabled, protocols?, identityRequired? }
  mcp?:           { endpoints, serverCard? }
  skills?:        { urls }                         // SkillEntry now also accepts { name, type, digest }
  a2a?:           { cards }
  ucp?:           { profiles }
  security?:      { contact, policy?, preferredLanguages? }
  headersExtras?: ExtraHeaderRule[]                // append-verbatim `_headers` / `vercel.json` rules
}
```

`payments.protocols` accepts the registered identifiers (`'x402'`, `'mpp'`, `'ap2'`) and any experimental identifier prefixed with `x-` (e.g. `'x-mypay'`) per agents.txt spec §3.1. Same convention for `authorization.protocols`. The set of identifiers comes from `@herald/core`'s `protocols.ts` registry, which is the single source of truth.

`mcp.serverCard`, `SkillEntry.{name, type, digest}`, and `payments.openapi` are the three opt-in fields that drive the ecosystem discovery surfaces (`/.well-known/mcp/server-card.json` per SEP-2127, `/.well-known/agent-skills/index.json` per agentskills.io v0.2.0, `/openapi.json` per the Payment Discovery draft). Each follows the same honest-declarations rule as the rest of herald: the matching generator returns `null` when its source block is absent, and the matching `_headers` / `Link:` entries only appear when the file does. The fourth ecosystem surface, `/.well-known/api-catalog` (RFC 9727), needs no new field; it derives its anchors entirely from the `mcp` / `a2a` / `ucp` blocks the config already declares. See [`packages/core/src/api-catalog.ts`](packages/core/src/api-catalog.ts), [`packages/core/src/mcp-server-card.ts`](packages/core/src/mcp-server-card.ts), [`packages/core/src/agent-skills-index.ts`](packages/core/src/agent-skills-index.ts), and [`packages/core/src/openapi.ts`](packages/core/src/openapi.ts) for the exact emission rules.

`headersExtras` is the escape hatch for adopters who need `_headers` / `vercel.json` entries herald has no built-in knowledge of: a vendored JSON Schema directory, an additional well-known surface, any path requiring custom CORS or `Content-Type`. Entries append verbatim to the generated headers file. Unmatched paths are a no-op at the edge, so dead entries are harmless. The reference deployment uses this field to register the `/schema/*` rule that serves the public `agents.json` JSON Schema; see the agents-txt repo's `app/site/agentsjson.config.js` for the worked example.

The `$schema` field herald injects into every generated `agents.json` is also driven from `@herald/core` (see `AGENTS_JSON_SCHEMA_URL` constant in `agents-json.ts`). The URL is duplicated between `@herald/core` and `@herald/schema` deliberately: core cannot import the schema package without violating its zero-dep rule. A round-trip test in `packages/schema/src/__tests__/herald-output.test.ts` catches drift if the two ever diverge.

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
| `generateApiCatalog(config)` | RFC 9727 `/.well-known/api-catalog` (`application/linkset+json`). Builds anchors from the `mcp` / `a2a` / `ucp` blocks; no new config field required. |
| `generateMcpServerCard(config)` | SEP-2127 `/.well-known/mcp/server-card.json`. Gated on `mcp.serverCard = { name, version, capabilities: { tools, resources, prompts } }`; returns `null` when the field is absent. |
| `generateAgentSkillsIndex(config)` | agentskills.io Discovery v0.2.0 index at `/.well-known/agent-skills/index.json`. Per-entry `name?` / `type?` / `digest: "sha256:<hex>"` on `SkillEntry`; entries without a digest are skipped at emit time with a warning. |
| `generateOpenApiJson(config)` | OpenAPI 3.1 at `/openapi.json` with `x-payment-info` per the [Payment Discovery draft](https://paymentauth.org/draft-payment-discovery-00.txt). Driven by `payments.openapi.paths`; single-offer paths use the direct shorthand, multi-offer use the `offers[]` array form. |
| `AGENTS_JSON_SCHEMA_URL` (constant) | Canonical JSON Schema URL injected into every generated `agents.json` as `$schema`. Lets editors (VS Code, JetBrains, `jq --schema`) give operators free autocomplete and inline validation. The schema document itself lives on agents-txt.com; `@herald/core` is unaware of the schema's shape, and `@herald/schema` owns that. |
| `generateHeadersFile(platform)` / `mergeVercelHeaders()` | §4.5 platform headers config (`_headers` or `vercel.json`). When the config carries an `mcp`, `a2a`, `ucp`, `skills`, or `payments.openapi` block, the generator emits matching CORS rules for the corresponding ecosystem discovery surfaces and an RFC 8288 `Link:` header block on `/` advertising every surface the site publishes. |
| `validateRobotsTxt / validateLlmsTxt / validateAgentsTxt / validateAgentsJson / validateSitemapXml / validateSecurityTxt` | Spec compliance checks on generated output |
| `sitemapDriver / firecrawlDriver / staticDriver / manualDriver` | ContentDriver factories (inject in tests) |

`validateAgentsJson` emits a `json-schema-ref` rule that recognises the `$schema` field as a positive signal when present and warns (with the canonical URL as the recommended value) when absent. The validator does not fetch the referenced schema; presence + string-shape is enough at this layer.

## Package: `@herald/schema`

**Zod source of truth for the agents.json wire format.** Lives in its own package because Zod is a runtime dependency `@herald/core` cannot accept (the zero-runtime-dep rule keeps core edge-runtime safe). Bridges three artefacts from one Zod declaration:

- `AgentsJsonSchema`: runtime validator (`AgentsJsonSchema.safeParse(json)`) for third-party consumers that have a served agents.json in hand
- `z.infer<typeof AgentsJsonSchema>`: re-exported as the `AgentsJson` TypeScript type
- `toJsonSchema()` / `toJsonSchemaString()`: derived JSON Schema 2020-12 document, hosted at `agents-txt.com/schema/agents-json/v1.0.json` for editor autocomplete

Key exports:

| Export | What it is |
|---|---|
| `AgentsJsonSchema` | Zod object schema. Call `.parse()` to validate, `.safeParse()` for non-throwing result. |
| `AgentsJson` | TypeScript type from `z.infer<typeof AgentsJsonSchema>`. Use for typed access to a parsed document. |
| `SCHEMA_VERSION` | Current wire-format version string (e.g. `"1.0"`). Bump when the wire shape changes. |
| `SCHEMA_ID` | Canonical hosted URL (e.g. `https://agents-txt.com/schema/agents-json/v1.0.json`). |
| `toJsonSchema()` | Derives a JSON Schema 2020-12 document from the Zod schema. Returns a plain JS object. |
| `toJsonSchemaString()` | Same as `toJsonSchema()`, JSON-stringified with 2-space indent and a trailing newline. Matches herald's formatting convention. |

CLI entry: `node dist/cli-emit.js <out-dir>` (or `pnpm --filter @agentstxtdev/herald-schema emit:json-schema <out-dir>`) writes `agents-json/v<SCHEMA_VERSION>.json` to the given directory. Used by the agents-txt.com reference deployment to keep the public schema file in sync with the Zod source.

The round-trip contract: every shape `generateAgentsJson` in `@herald/core` can emit must validate cleanly against `AgentsJsonSchema`. Enforced by an integration test in `packages/schema/src/__tests__/herald-output.test.ts`. If a future generator change emits a field the schema does not model, the test fails before merge.

## Package: `@herald/cli`

```
packages/cli/src/
├── cli.ts            — Commander entry: init | emit | check
├── project-probe.ts  — detectProject(): reads package.json, .env, scans for sitemap
├── config-writer.ts  — buildAgenticConfigContent() + writeAgenticConfig()
├── config-schema.ts  — Zod v4 schema for AgenticConfig (CLI-only — keeps core dep-free)
└── commands/
    ├── init.ts       — readline wizard (orchestrates probe + writer)
    ├── emit.ts       — validates config via Zod, writes files, runs spec validators
    └── check.ts      — fetches live site, scores compliance
```

**`init` wizard flow:**
1. `detectProject()`: reads `package.json`, `.env*`, scans for `sitemap.xml`, detects framework
2. readline prompts pre-filled with detected values (or `-y` to skip all)
3. `writeAgenticConfig(path, choices)` → writes `agentsjson.config.js`

**`emit` flow:**
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
Fetches `robots.txt`, `llms.txt`, `agents.txt`, `agents.json`, `sitemap.xml` and scores them using the same validators as `emit`.

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

### Protocol summary

| Protocol | What it is | Spec link | What flows into `agents.json` |
|---|---|---|---|
| **x402 v2** | Per-request crypto, on-chain settlement via a public facilitator. Agent signs an EIP-3009 (EVM) or SVM payload after a 402 advertising `accepts[]`. | [x402.org](https://x402.org/) | `payments.x402` with `chains` (CAIP-2 from `evmChains` + Solana network), `pricing`, `payTo` (operator's public wallet address) |
| **MPP** | Session-based fiat + stablecoins via `WWW-Authenticate: Payment` challenge / credential. Two methods: Tempo (USDC) and Stripe SPT (cards + Solana USDC). | [mpp.dev](https://mpp.dev/), IETF `draft-ryan-httpauth-payment` | `payments.mpp` with `methods` (`['tempo', 'stripe']`, gated on credentials) and `pricing` |
| **AP2** | Mandate trust layer that *composes above* the rail. Agent presents signed `CheckoutMandate` + `PaymentMandate` as W3C VCs; settlement still runs over x402 / MPP. | [ap2-protocol.org](https://ap2-protocol.org/) | `payments.ap2` with `presentations` (e.g. `['sd-jwt-vc']`) and `spec` URL |
| **UCP** | Profile-based commerce discovery. Site publishes a UCP profile (typically at `/.well-known/ucp`) describing services, capabilities, payment handlers, signing keys. | [ucp.dev](https://ucp.dev/) | `ucp[]` array of profile URLs; the profile document itself is authored separately |

**Trust model**: x402-on-EVM/Solana keeps keys on the agent; MPP/Tempo same; MPP/Stripe is custodial (Stripe holds keys on both sides). Stripe SPT can settle Solana USDC without any wallet involvement, so a site advertising both rails reaches both wallet-native and customer-credential agent populations. The two populations barely overlap, which is why the gate emits one combined 402 carrying both protocols' challenges.

**Built-in USDC defaults** (in `@herald/core`): Base mainnet `0x833…2913`, Base Sepolia `0x036…CF7e`, Ethereum mainnet `0xA0b…eB48`, Solana mainnet `EPjF…Dt1v`, Solana devnet `4zMM…ncDU`. Override per-network via `x402.assets[network]`.

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

## Adding a New Well-Known Discovery Surface

Herald already emits four ecosystem discovery files alongside `agents.txt` / `agents.json`: RFC 9727 API catalog, SEP-2127 MCP server card, agentskills.io Discovery v0.2.0 index, and OpenAPI 3.1 with `x-payment-info` per the Payment Discovery draft. When a new ecosystem-level discovery surface stabilizes (a new RFC, a new SEP, a new well-known path that scanners probe), add a generator using the same shape as the existing four:

1. **New generator file** in [`packages/core/src/`](packages/core/src/) (e.g. `xyz-discovery.ts`) exporting `generateXyzDiscovery(config): string | null`. Pure function, zero IO, zero runtime deps. Return `null` when the source block in the config is absent so the CLI can skip cleanly.
2. **Types** in [`packages/core/src/types.ts`](packages/core/src/types.ts). Either extend an existing block (the way `mcp.serverCard?` extends `McpConfig`) or add a new top-level optional field. Keep the type strictly optional; the honest-declarations rule applies.
3. **Headers** in [`packages/core/src/headers.ts`](packages/core/src/headers.ts). Inside `entriesForConfig`, add the matching `_headers` entry gated on the same config-block presence test the generator uses. Also append to the `linkValues` array if the surface deserves an RFC 8288 `Link:` header on `/`. The rule: a Link header MUST point at a path the site emits, so the gate is identical.
4. **Index export** in [`packages/core/src/index.ts`](packages/core/src/index.ts).
5. **CLI wiring** in [`packages/cli/src/commands/emit.ts`](packages/cli/src/commands/emit.ts) inside the `outputs.has('discovery')` branch. Mirror the existing pattern: call the generator, write the file when non-null, print a `✔` line; print a `⚠ skipped` line when the source field is absent but the surrounding block is present.
6. **Zod schema** in [`packages/cli/src/config-schema.ts`](packages/cli/src/config-schema.ts) for any new config fields. Keep the regex / enum constraints tight (e.g. the `sha256:[0-9a-f]{64}` regex on `SkillEntry.digest` rejects malformed digests at parse time).
7. **Tests** under [`packages/core/src/__tests__/`](packages/core/src/__tests__/) covering: emission with the block present, null return without it, headers-test updates if a new `_headers` source line gets added (the `vercelHeaderEntries` assertions need updating to include the new source).
8. **CLAUDE.md** addition to the "Key exports" table above plus the matching `agentsjson.config.js` example block in a downstream README so adopters can see the shape.
9. **Spec §12 row** in `agents-txt/app/site/src/content/spec/AGENTS-TXT-STANDARD.md` describing how the new surface relates to `agents.txt`. Editorial change, no version bump needed.

The four existing surfaces are the worked examples; pick whichever shape is closest to the new one and copy. None of them needed runtime IO; if a new surface requires hashing or fetching (the way agent-skills/v0.2.0 needs sha256 digests), keep the IO at the CLI layer and have core accept a precomputed value, so `@herald/core` stays edge-runtime safe.

## Key Design Decisions (Why, Not What)

- **Single config object**: one source of truth for all generators; users configure once
- **Core has zero deps**: safe on edge runtimes; Zod stays in CLI only
- **Declaration only**: herald emits the discovery files that *advertise* payment and auth support. The 402 handler, signature verification, and settlement are out of scope and live in whatever middleware the adopter wires up
- **Two validation layers with different purposes**: core validates generated *output* (spec compliance); CLI validates *input* (Zod schema on AgenticConfig before generation)
- **agents.txt is Layer 4**: plain-text capabilities declaration; wallet/pricing details that are runtime concerns (signatures, full token contracts, secret keys) stay in 402 responses, not in the discovery file
