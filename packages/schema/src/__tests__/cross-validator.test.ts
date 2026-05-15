// ─────────────────────────────────────────────────────────────────────────────
// Cross-validator agreement test.
//
// Runs the canonical Zod schema (this package) and herald-core's hand-written
// `validateAgentsJson` against the same fixture corpus, asserting all three
// of:
//
//   1. Zod's verdict matches the fixture's expected validity (`valid-*` /
//      `invalid-*` filename convention).
//   2. herald-core's verdict matches the fixture's expected validity.
//   3. The two validators agree with each other on the binary pass/fail.
//
// herald-output.test.ts covers the producer side (every shape
// generateAgentsJson can emit validates against AgentsJsonSchema). This file
// covers the consumer side (independent validator implementations agree on
// the same wire-format judgement).
//
// The MCP worker runs the same corpus from a duplicated copy at
// agentstxt/app/mcp/src/__tests__/fixtures/. A sync check (see scripts/
// sync-check-fixtures.mjs) asserts byte-equality between the two copies.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAgentsJson } from '@agentstxtdev/herald-core'
import { AgentsJsonSchema } from '../index.js'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

/** Every fixture in this directory must follow the `valid-` / `invalid-` filename convention. */
function loadCorpus(): Array<{ name: string; expectedValid: boolean; raw: string; parsed: unknown }> {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((name) => {
      let expectedValid: boolean
      if (name.startsWith('valid-')) expectedValid = true
      else if (name.startsWith('invalid-')) expectedValid = false
      else throw new Error(`Fixture "${name}" must start with "valid-" or "invalid-".`)
      const raw = readFileSync(join(FIXTURES_DIR, name), 'utf8')
      return { name, expectedValid, raw, parsed: JSON.parse(raw) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const corpus = loadCorpus()

describe('cross-validator agreement: Zod (canonical) vs herald-core', () => {
  it('corpus is non-empty and covers both verdicts', () => {
    expect(corpus.length).toBeGreaterThan(0)
    expect(corpus.some((f) => f.expectedValid)).toBe(true)
    expect(corpus.some((f) => !f.expectedValid)).toBe(true)
  })

  describe.each(corpus)('$name (expected valid: $expectedValid)', ({ raw, parsed, expectedValid }) => {
    const zodResult = AgentsJsonSchema.safeParse(parsed)
    const heraldResults = validateAgentsJson(raw)
    const heraldValid = !heraldResults.some((r) => r.status === 'fail')

    it('Zod verdict matches expected', () => {
      if (zodResult.success !== expectedValid) {
        // Surface the issue list so a drift is debuggable from the failure output.
        console.error('Zod issues:', JSON.stringify(zodResult.success ? null : zodResult.error.issues, null, 2))
      }
      expect(zodResult.success).toBe(expectedValid)
    })

    it('herald-core verdict matches expected', () => {
      if (heraldValid !== expectedValid) {
        const failures = heraldResults.filter((r) => r.status === 'fail').map((r) => `${r.rule}: ${r.message}`)
        console.error('herald-core failures:', failures)
      }
      expect(heraldValid).toBe(expectedValid)
    })

    it('Zod and herald-core agree on the binary verdict', () => {
      expect(zodResult.success).toBe(heraldValid)
    })
  })
})
