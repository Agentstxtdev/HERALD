#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Cross-repo fixture-equality check.
//
// The agents.json cross-validator corpus lives in two places:
//   - agentify/packages/schema/src/__tests__/fixtures/       (canonical)
//   - agentstxt/app/mcp/src/__tests__/fixtures/              (mirrored)
//
// Both copies must be byte-identical. This script computes a SHA-256 digest of
// every JSON file in each directory and asserts the two sets match. CI runs
// it after the test suite; a mismatch fails the job with a clear instruction
// to re-mirror the fixtures.
//
// Invocation (from herald repo root):
//   node scripts/sync-check-fixtures.mjs                          # default paths
//   node scripts/sync-check-fixtures.mjs <canonical-dir> <mirror-dir>
//
// The default mirror path assumes the agentstxt repo sits as a sibling of the
// herald repo on disk. Override via the second argument when running in CI
// where the layout differs.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

const DEFAULT_CANONICAL = join(REPO_ROOT, 'packages/schema/src/__tests__/fixtures')
const DEFAULT_MIRROR = resolve(REPO_ROOT, '../agentstxt/app/mcp/src/__tests__/fixtures')

const canonicalDir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_CANONICAL
const mirrorDir = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_MIRROR

function fail(msg) {
  console.error(`\x1b[31mERROR\x1b[0m sync-check-fixtures: ${msg}`)
  process.exit(1)
}

if (!existsSync(canonicalDir)) fail(`canonical dir does not exist: ${canonicalDir}`)
if (!existsSync(mirrorDir)) fail(`mirror dir does not exist: ${mirrorDir}\n  (override the second argument when running in CI on a different layout)`)

function hashJsonFilesIn(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  const map = new Map()
  for (const f of files) {
    const buf = readFileSync(join(dir, f))
    map.set(f, createHash('sha256').update(buf).digest('hex'))
  }
  return map
}

const canonical = hashJsonFilesIn(canonicalDir)
const mirror = hashJsonFilesIn(mirrorDir)

const onlyInCanonical = [...canonical.keys()].filter((f) => !mirror.has(f))
const onlyInMirror = [...mirror.keys()].filter((f) => !canonical.has(f))
const changed = [...canonical.entries()].filter(([f, hash]) => mirror.has(f) && mirror.get(f) !== hash).map(([f]) => f)

const ok = onlyInCanonical.length === 0 && onlyInMirror.length === 0 && changed.length === 0

if (!ok) {
  console.error('\x1b[31m✗\x1b[0m fixture corpora are out of sync')
  if (onlyInCanonical.length > 0) console.error(`  Only in canonical (${canonicalDir}): ${onlyInCanonical.join(', ')}`)
  if (onlyInMirror.length > 0) console.error(`  Only in mirror    (${mirrorDir}): ${onlyInMirror.join(', ')}`)
  if (changed.length > 0) console.error(`  Differ in content: ${changed.join(', ')}`)
  console.error('\n  To resync, copy the canonical files into the mirror:')
  console.error(`    cp ${canonicalDir}/*.json ${mirrorDir}/`)
  process.exit(1)
}

console.log(`\x1b[32m✓\x1b[0m fixture corpora are in sync (${canonical.size} files)`)
