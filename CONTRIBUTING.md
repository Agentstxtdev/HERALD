# Contributing to herald

Thanks for taking the time to contribute. herald is a small, opinionated toolkit; the bar is "make every change reversible, understandable, and shippable."

This guide covers what's specific to this repository. For overall code conventions and architectural rules, read [`AGENTS.md`](AGENTS.md) (codebase guide) and [`CLAUDE.md`](CLAUDE.md) (operating instructions for AI agents — humans benefit from them too).

---

## Before you start

- herald is the **toolkit** — two npm-publishable packages (`@herald/core`, `@herald/cli`) plus example consumers. It is *not* the place for `agents.txt` spec changes; those happen in the sibling repository where the spec lives.
- Open an issue or discussion before sending large PRs. Small fixes (typo, bug, doc clarification) are fine without a heads-up.
- Run on **Node 24 (`nvm use 24`)** and **pnpm 10**. The lockfile is committed; respect it (`pnpm install --frozen-lockfile`).

---

## Setup

```bash
git clone https://github.com/agents-txt/herald
cd herald

nvm use 24
pnpm install
pnpm build       # builds core → cli in dependency order via Turbo
pnpm typecheck   # tsc --noEmit across all packages
pnpm test        # vitest run, 326 tests
```

If anything in that sequence fails on a clean clone, that's a bug — please file an issue with the failing output before trying to fix something else.

---

## Daily workflow

```bash
# Watch mode (rebuild + typecheck on save, parallel across packages)
pnpm dev

# Single-package focus
pnpm --filter @herald/core typecheck
pnpm --filter @herald/cli  typecheck
pnpm --filter @herald/cli  build

# Run the CLI from your local build
node packages/cli/dist/cli.js init
```

---

## What goes where

| Change type | Location |
|---|---|
| Pure generator (robots / llms / agents.txt / agents.json / sitemap.xml / security.txt) | `packages/core/src/` |
| Spec validator | `packages/core/src/validate.ts` |
| New content driver | `packages/core/src/sitemap.ts` (factory) + `LlmsDriver` union in `types.ts` + `resolveContent()` in `llms.ts` |
| Headers config (§4.5) | `packages/core/src/headers.ts` (`generateHeadersFile`, `mergeVercelHeaders`) |
| Protocol registry | `packages/core/src/protocols.ts` (`PAYMENT_PROTOCOLS`, `AUTH_PROTOCOLS`, `MPP_METHODS`) |
| Payment declaration activation | `packages/core/src/payments.ts` (`resolveActiveProtocols`, `isX402Active`, `isMppActive`, `isAp2Active`) |
| CLI command | `packages/cli/src/commands/<name>.ts` |
| CLI wizard prompt | `packages/cli/src/commands/init.ts` |
| Config Zod schema | `packages/cli/src/config-schema.ts` (CLI-only, never import Zod into `core`) |
| Wire-format Zod schema (agents.json shape) | `packages/schema/src/agents-json-schema.ts`. Single source for the runtime validator, the `AgentsJson` type, and the hosted JSON Schema. Bump `SCHEMA_VERSION` when changing the wire shape and re-emit the JSON Schema file. |
| `$schema` URL injected by the generator | `AGENTS_JSON_SCHEMA_URL` constant in `packages/core/src/agents-json.ts`. Kept in lockstep with `SCHEMA_ID` in `@herald/schema` by the round-trip test. |
| Cross-validator fixture corpus | `packages/schema/src/__tests__/fixtures/` is canonical; the agents-txt MCP worker keeps a byte-identical mirror at `app/mcp/src/__tests__/fixtures/`. Editing the wire schema so a fixture's verdict flips means updating **both** copies. `pnpm sync-check:fixtures` asserts byte-equality and CI fails the PR on drift. See the directory's own `README.md` for the `valid-` / `invalid-` naming rule and the excluded disagreement zones. |

Detailed architecture and rules: [`AGENTS.md`](AGENTS.md).

---

## Hard rules

These are non-negotiable. Violations get sent back without further review.

1. **`@herald/core` has zero runtime dependencies.** Do not add any. Edge-runtime compatibility is a property we sell to users.
2. **Zod stays in `packages/cli` only.** Never import Zod into `core`.
3. **Declaration only.** Herald is a file generator. Do not add runtime middleware (402 handlers, framework adapters, request gates) to the toolkit; the spec is implementation-agnostic, and the runtime side belongs in whatever middleware an adopter wires up separately.
4. **No secrets in commits.** No `.env`, no wallet private keys, no Stripe secret keys, no MPP HMAC keys. CI has no secret scanner; you are the scanner.
5. **No `console.log` left in shipped code** (except inside `packages/cli/src/commands/`, which is allowed to print to the user). Use it during development elsewhere, remove before opening the PR.
6. **`exactOptionalPropertyTypes: true` is on.** Don't cheat the compiler with `as any` to silence it; restructure the type instead.
7. **Spec compliance, not best-effort.** Generated files must validate against their respective specs (RFC 9309, sitemaps.org 0.9, llmstxt.org, agents.txt v1, RFC 9116). The validators in `core` enforce this; if a validator says no, fix the generator.
8. **Honest declarations.** A per-protocol block in `agents.txt` / `agents.json` is emitted only when its credentials are present in the config. New payment protocols added to `PAYMENT_PROTOCOLS` must include an activity check in `payments.ts` and a branch in `resolveActiveProtocols` before they will surface in any output.

---

## Tests

- Vitest at the root (`pnpm test`) runs every `packages/*/src/**/*.test.ts`. **Always run from the workspace root**; running `pnpm test` from a sub-package picks the same root config but applies the include glob to the wrong cwd and reports "no test files found".
- Tests are colocated with code under `__tests__/` directories.
- New generators or validators **require new tests**. PRs adding behavior without tests will be asked to add them.
- `ContentDriver` is a seam for tests — pass `staticDriver(pages)` to `generateLlmsTxt(config, driver)` to exercise the full generator without network calls.
- The wire-format schema carries two agreement tests in `packages/schema/`: `herald-output.test.ts` (every shape `generateAgentsJson` can emit validates against `AgentsJsonSchema` — the producer side) and `cross-validator.test.ts` (the canonical Zod schema and herald-core's hand-written `validateAgentsJson` return the same pass/fail verdict on the shared fixture corpus — the consumer side). A change to `agents-json-schema.ts` or `validate.ts` will move these; keep the fixture corpus and its agents-txt mirror in sync (`pnpm sync-check:fixtures`).
- Aim for tests that exercise observable behavior, not internal implementation. If a refactor breaks a test that should still pass, the test was over-specified.

---

## Changesets — versioning and npm publish

herald uses [Changesets](https://github.com/changesets/changesets) for versioning. **Any PR that changes anything published to npm must include a changeset.**

```bash
# After making your changes:
pnpm changeset

# Pick the affected packages, pick severity:
#   patch  — bug fix, internal refactor, no public API change
#   minor  — new feature, additive API, new exports
#   major  — breaking change, removed export, renamed field
# Write a one-paragraph summary that an end user would understand.
```

This commits a `.changeset/<random>.md` file. Include it in your PR.

**No changeset needed for:** docs-only changes, CI/workflow changes, examples, dotfiles.

**Major-version PRs get extra scrutiny.** A new `AgenticConfig` field rename or a removed export is a breaking change for every downstream consumer; the PR description must include a one-line migration note.

---

## PR conventions

The [PR template](.github/PULL_REQUEST_TEMPLATE.md) is required. Specifically:

- **Thinking path** — five to eight steps, blockquote style, traces from "herald is X" down to "this PR does Y."
- **Verification** — copy-paste the commands a reviewer should run plus expected output (test counts, build success).
- **Risks** — even if "Low risk."
- **Changeset** — name the file or write "no changeset needed" with reason.
- **Model used** — be specific: provider, model ID/version, thinking mode if applicable. "Claude" is not enough; "claude-opus-4-7 in extended thinking mode" is.
- **Checklist** — tick the boxes you've actually completed. Reviewers check.

### Commit messages

No imposed format. Conventional commits are welcome but not required. What matters: the PR title and body explain *what* and *why*; the commit messages don't need to.

### Branches

Branch off `main`. Name branches whatever you want; we squash on merge.

---

## Architecture decisions

If you're proposing something that touches the design (new package, new top-level export, change to the gate decision flow, change to the config shape), open an issue first and link it from the PR. We track design history in `docs/CHANGELOG-YYYY-MM-DD-*.md` files; the format is loose but consistent.

Reference for in-flight decisions: [`docs/index.md`](../docs/index.md).

---

## Reporting bugs

Open a GitHub issue. Include:

- Node + pnpm version (`node -v`, `pnpm -v`)
- Operating system
- A minimal reproduction (a small `agentsjson.config.js` plus the command that fails)
- Full stack trace if there is one
- What you expected versus what happened

Bugs in generated output that don't match a spec validator's expectations are taken seriously — please file these with the offending generated file plus the validator's complaint.

---

## License

By contributing, you agree your contributions are licensed under [Apache 2.0](LICENSE), the same license as the rest of the repository.
