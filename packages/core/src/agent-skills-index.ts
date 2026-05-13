// ─────────────────────────────────────────────────────────────────────────────
// Agent Skills Discovery index generator —
// /.well-known/agent-skills/index.json (Cloudflare RFC v0.2.0)
//
// Publishes a machine-readable list of the skills declared in `config.skills`,
// with name / type / description / url / digest per entry. Agents read this to
// discover and verify skill artefacts before fetching them.
//
// The digest field is required by the v0.2.0 schema and must be supplied per
// entry as `digest: 'sha256:<hex>'` in `agentsjson.config.js`. herald's core
// stays dep-free and IO-free; computing the hash from a local SKILL.md path is
// a CLI-layer concern (see the CLI's emit command for the hashing helper).
//
// Honest-declarations rule: an entry without a digest is omitted from the
// index with a console warning, because publishing without a verification hash
// breaks the discovery contract.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig, SkillEntry } from './types.js'

const SCHEMA_URL = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

function defaultNameFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    const segments = u.pathname.split('/').filter(Boolean)
    // strip a trailing SKILL.md (or any *.md) to get the skill folder name
    while (segments.length && /\.md$/i.test(segments[segments.length - 1] ?? '')) {
      segments.pop()
    }
    return segments[segments.length - 1] ?? null
  } catch {
    return null
  }
}

export function generateAgentSkillsIndex(config: AgenticConfig): string | null {
  if (!config.skills) return null
  const raw = config.skills.urls
  const entries = Array.isArray(raw) ? raw : [raw]
  if (entries.length === 0) return null

  const skills: Array<Record<string, unknown>> = []
  for (const entry of entries) {
    const isObj = typeof entry !== 'string'
    const url = isObj ? (entry as SkillEntry).url : entry
    const description = isObj ? (entry as SkillEntry).description : undefined
    const explicitName = isObj ? (entry as SkillEntry).name : undefined
    const type = (isObj && (entry as SkillEntry).type) || 'skill-md'
    const digest = isObj ? (entry as SkillEntry).digest : undefined

    const name = explicitName ?? defaultNameFromUrl(url)
    if (!name) {
      console.warn(`[herald] skipping agent-skills entry: cannot derive name for ${url}`)
      continue
    }
    if (!digest) {
      console.warn(`[herald] skipping agent-skills entry "${name}": missing sha256 digest. Add { digest: "sha256:…" } to the skill entry.`)
      continue
    }

    skills.push({
      name,
      type,
      ...(description ? { description } : {}),
      url,
      digest,
    })
  }

  if (skills.length === 0) return null

  return JSON.stringify({ $schema: SCHEMA_URL, skills }, null, 2) + '\n'
}
