import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateAgentSkillsIndex } from '../agent-skills-index.js'
import type { AgenticConfig } from '../types.js'

const base: AgenticConfig = {
  site: { name: 'Example', url: 'https://example.com' },
}

const FAKE_DIGEST = 'sha256:' + 'a'.repeat(64)

let warnSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('generateAgentSkillsIndex', () => {
  it('returns null when skills block is absent', () => {
    expect(generateAgentSkillsIndex(base)).toBeNull()
  })

  it('returns null when skills.urls is an empty array', () => {
    expect(generateAgentSkillsIndex({ ...base, skills: { urls: [] } })).toBeNull()
  })

  it('emits the agentskills.io $schema URL', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', digest: FAKE_DIGEST }] },
    })!
    expect(out).not.toBeNull()
    const parsed = JSON.parse(out)
    expect(parsed.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json')
  })

  it('emits one entry per skill with name derived from URL when not explicit', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', digest: FAKE_DIGEST }] },
    })!
    const parsed = JSON.parse(out)
    expect(parsed.skills).toHaveLength(1)
    expect(parsed.skills[0].name).toBe('foo')
    expect(parsed.skills[0].url).toBe('https://example.com/skills/foo/SKILL.md')
    expect(parsed.skills[0].digest).toBe(FAKE_DIGEST)
  })

  it('respects an explicit name override', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', name: 'custom-name', digest: FAKE_DIGEST }] },
    })!
    expect(JSON.parse(out).skills[0].name).toBe('custom-name')
  })

  it('defaults type to "skill-md" when not specified', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', digest: FAKE_DIGEST }] },
    })!
    expect(JSON.parse(out).skills[0].type).toBe('skill-md')
  })

  it('respects an explicit type', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', type: 'agent-skill', digest: FAKE_DIGEST }] },
    })!
    expect(JSON.parse(out).skills[0].type).toBe('agent-skill')
  })

  it('omits description when not provided', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', digest: FAKE_DIGEST }] },
    })!
    expect(JSON.parse(out).skills[0]).not.toHaveProperty('description')
  })

  it('emits description when provided', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', description: 'Foo skill', digest: FAKE_DIGEST }] },
    })!
    expect(JSON.parse(out).skills[0].description).toBe('Foo skill')
  })

  it('SKIPS entries without a digest and warns', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md' }] },
    })
    expect(out).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/missing sha256 digest/)
  })

  it('SKIPS bare-string skill entries (no way to attach digest) and warns', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: ['https://example.com/skills/foo/SKILL.md'] },
    })
    expect(out).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('SKIPS entries whose URL cannot yield a name and warns', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'not-a-url', digest: FAKE_DIGEST }] },
    })
    expect(out).toBeNull()
    expect(warnSpy.mock.calls.some((c) => /cannot derive name/.test(String(c[0])))).toBe(true)
  })

  it('emits only the digest-bearing entries when mixed with invalid ones', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: {
        urls: [
          { url: 'https://example.com/skills/no-digest/SKILL.md' },
          { url: 'https://example.com/skills/good/SKILL.md', digest: FAKE_DIGEST },
        ],
      },
    })!
    const parsed = JSON.parse(out)
    expect(parsed.skills).toHaveLength(1)
    expect(parsed.skills[0].name).toBe('good')
  })

  it('always ends with a single trailing newline', () => {
    const out = generateAgentSkillsIndex({
      ...base,
      skills: { urls: [{ url: 'https://example.com/skills/foo/SKILL.md', digest: FAKE_DIGEST }] },
    })!
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})
