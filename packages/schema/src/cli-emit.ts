#!/usr/bin/env node
// Standalone JSON Schema emitter. Writes `agents-json/v<VERSION>.json` to the
// path passed as the first argument (default: ./schema). Used by the build
// pipeline to refresh the static asset under
// `agentstxt/app/site/public/schema/` so the public schema URL always matches
// what the Zod source produces.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SCHEMA_VERSION, toJsonSchemaString } from './index.js'

const outDir = resolve(process.argv[2] ?? './schema')
const dir = join(outDir, 'agents-json')
mkdirSync(dir, { recursive: true })

const outFile = join(dir, `v${SCHEMA_VERSION}.json`)
writeFileSync(outFile, toJsonSchemaString(), 'utf8')

console.log(`✔ wrote ${outFile}`)
