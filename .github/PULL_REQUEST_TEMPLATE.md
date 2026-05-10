## Thinking Path

<!--
  Required. Trace your reasoning from the top of the project down to this
  specific change. Start with what agentify is, then narrow through the
  package, the problem, and why this PR exists. Use blockquote style.
  Aim for 5–8 steps. See CONTRIBUTING.md for full examples.
-->

> - agentify makes any website readable and (optionally) monetizable by AI agents
> - [Which package or surface is involved — @agentify/core / @agentify/web / agentify CLI / examples / docs]
> - [What problem or gap exists]
> - [Why it needs to be addressed]
> - This pull request ...
> - The benefit is ...

## What Changed

<!-- Bullet list of concrete changes. One bullet per logical unit. -->

-

## Verification

<!--
  How can a reviewer confirm this works? Include test commands, manual
  steps, or both. Example commands:
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm publint
  For CLI changes, include a paste of `npx agentify init` or `generate` output.
-->

-

## Risks

<!--
  What could go wrong? Mention API breaking changes, schema migrations,
  facilitator behavior shifts, peer-dep version bumps, or "Low risk" if
  genuinely minor. Note any field renames in `AgenticConfig` since those
  break user configs.
-->

-

## Changeset

<!--
  If this PR changes anything in `packages/`, include a changeset entry
  under `.changeset/`. Run `pnpm changeset` to generate one. Use:
    • patch  — bug fix, internal refactor, no public API change
    • minor  — new feature, additive API, new exports
    • major  — breaking change, removed export, renamed field
  If this PR only changes docs / CI / examples, write "no changeset needed"
  in the bullet below.
-->

-

## Model Used

<!--
  Required. Specify which AI model was used to produce or assist with
  this change. Be as descriptive as possible — include:
    • Provider and model name (e.g., Claude, GPT, Gemini, Codex)
    • Exact model ID or version (e.g., claude-opus-4-7, gpt-5)
    • Reasoning/thinking mode if applicable (e.g., extended thinking)
    • Any other relevant capability details (e.g., tool use, code execution)
  If no AI model was used, write "None — human-authored".
-->

-

## Checklist

- [ ] Thinking path traces from project context to this change
- [ ] Model used is specified (with version and capability details)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (or new tests added for the change)
- [ ] `pnpm build` succeeds
- [ ] `pnpm publint` is green for any modified `packages/*/package.json`
- [ ] Changeset added (or "no changeset needed" if docs/CI/examples only)
- [ ] CLAUDE.md / AGENTS.md / README.md updated if the change affects public surface area
- [ ] No `console.log` debugging left behind
- [ ] No secrets, wallet keys, or `.env` files committed
- [ ] I will address all reviewer comments before requesting merge
