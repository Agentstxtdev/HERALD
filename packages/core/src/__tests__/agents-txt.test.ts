import { describe, it, expect } from 'vitest'
import { generateAgentsTxt } from '../agents-txt.js'
import type { AgenticConfig } from '../types.js'

const baseConfig: AgenticConfig = {
  site: { name: 'Test Site', url: 'https://example.com', description: 'A test site' },
}

// Backing fixtures — required for protocols to be considered "active" (and
// therefore emitted in the Payments block). A protocol declared without
// backing is silently dropped, on purpose, so discovery files don't lie.
const x402Backing = {
  x402: { treasury: { evmAddress: '0x1234567890123456789012345678901234567890' } },
} as const
const mppBacking = {
  mpp: { tempoRecipient: '0x1234567890123456789012345678901234567890' },
} as const
const allBacking = { ...x402Backing, ...mppBacking }

describe('generateAgentsTxt', () => {
  it('always includes the standard header comments', () => {
    const output = generateAgentsTxt(baseConfig)
    expect(output).toContain('# agents.txt')
    expect(output).toContain('# Standard: https://agentstxt.dev')
  })

  it('returns header only when no payments config', () => {
    const output = generateAgentsTxt(baseConfig)
    expect(output).not.toContain('Payments:')
    expect(output).not.toContain('Protocols:')
  })

  it('returns header only when payments has no protocols and no backing', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: [] },
    }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('Payments:')
    expect(output).not.toContain('Protocols:')
  })

  it('emits the Protocols: line as the payments block signal', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402'], ...x402Backing },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: x402')
    expect(output).not.toContain('Payments: enabled')
  })

  it('emits Payments: required when payments.required is true', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402'], required: true, ...x402Backing },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: x402')
    expect(output).toContain('Payments: required')
  })

  it('omits Payments: required line when payments.required is not set', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402'], ...x402Backing },
    }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('Payments:')
  })

  it('outputs x402 only when protocols is [x402]', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402'], ...x402Backing },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: x402')
    expect(output).not.toContain('mpp')
  })

  it('outputs mpp only when protocols is [mpp]', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['mpp'], ...mppBacking },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: mpp')
    expect(output).not.toContain('x402')
  })

  it('outputs both when protocols is [x402, mpp]', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402', 'mpp'], ...allBacking },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: x402, mpp')
  })

  it('defaults protocols to [mpp, x402] when protocols is not specified', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { ...allBacking },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: mpp, x402')
  })

  it('drops protocols that are declared but unbacked', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      // x402 listed but no treasury → x402 dropped. mpp listed and has tempoRecipient → kept.
      payments: { protocols: ['x402', 'mpp'], ...mppBacking },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: mpp')
    expect(output).not.toContain('Protocols: x402')
  })

  it('omits Payments block entirely when no protocol is backed', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402', 'mpp'] }, // no backing
    }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('Payments:')
    expect(output).not.toContain('Protocols:')
  })

  it('has a blank line between JSON comment and payment section', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402'], ...x402Backing },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('# JSON: https://example.com/agents.json\n\nProtocols:')
  })

  it('does not include wallet addresses or pricing', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: {
        protocols: ['x402'],
        x402: {
          treasury: { evmAddress: '0x1234567890123456789012345678901234567890' },
          pricing: { amount: '0.001', token: 'USDC' },
        },
      },
    }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('0x1234')
    expect(output).not.toContain('0.001')
    expect(output).not.toContain('USDC')
  })

  it('ends with a newline', () => {
    const output = generateAgentsTxt(baseConfig)
    expect(output.endsWith('\n')).toBe(true)
  })
})

describe('generateAgentsTxt — authorization block', () => {
  it('omits Authorization block when authorization not configured', () => {
    const output = generateAgentsTxt(baseConfig)
    expect(output).not.toContain('Authorization:')
    expect(output).not.toContain('Identity:')
  })

  it('omits Authorization block when authorization.enabled is false', () => {
    const config: AgenticConfig = { site: baseConfig.site, authorization: { enabled: false } }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('Authorization:')
  })

  it('emits Authorization: agent-auth by default when enabled with no protocols', () => {
    const config: AgenticConfig = { site: baseConfig.site, authorization: { enabled: true } }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Authorization: agent-auth')
  })

  it('emits explicit protocol list when provided', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      authorization: { enabled: true, protocols: ['agent-auth'] },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Authorization: agent-auth')
  })

  it('emits Identity: required when identityRequired is true', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      authorization: { enabled: true, identityRequired: true },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Identity: required')
  })

  it('omits Identity line when identityRequired is false', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      authorization: { enabled: true, identityRequired: false },
    }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('Identity:')
  })

  it('omits Identity line when identityRequired is not set', () => {
    const config: AgenticConfig = { site: baseConfig.site, authorization: { enabled: true } }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('Identity:')
  })

  it('has a blank line between JSON comment and authorization block when no payments', () => {
    const config: AgenticConfig = { site: baseConfig.site, authorization: { enabled: true } }
    const output = generateAgentsTxt(config)
    expect(output).toContain('# JSON: https://example.com/agents.json\n\nAuthorization:')
  })

  it('has a blank line between payments block and authorization block', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402'], ...x402Backing },
      authorization: { enabled: true },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: x402\n\nAuthorization:')
  })

  it('includes both payments and authorization blocks together — setup for next suite', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402', 'mpp'], ...allBacking },
      authorization: { enabled: true, identityRequired: true },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: x402, mpp')
    expect(output).toContain('Authorization: agent-auth')
    expect(output).toContain('Identity: required')
  })
})

describe('generateAgentsTxt — MCP block', () => {
  it('omits MCP block when mcp not configured', () => {
    const output = generateAgentsTxt(baseConfig)
    expect(output).not.toContain('MCP:')
  })

  it('emits a single MCP: line for a string endpoint', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: 'https://example.com/mcp' },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('MCP: https://example.com/mcp')
  })

  it('emits a single MCP: line for a one-item array', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: ['https://example.com/mcp'] },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('MCP: https://example.com/mcp')
  })

  it('emits multiple MCP: lines in order for multiple endpoints', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: ['https://example.com/mcp', 'https://example.com/mcp-premium'] },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('MCP: https://example.com/mcp\nMCP: https://example.com/mcp-premium')
  })

  it('has a blank line between JSON comment and MCP block when no other blocks', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: 'https://example.com/mcp' },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('# JSON: https://example.com/agents.json\n\nMCP:')
  })

  it('has a blank line between authorization block and MCP block', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      authorization: { enabled: true },
      mcp: { endpoints: 'https://example.com/mcp' },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Authorization: agent-auth\n\nMCP:')
  })

  it('works standalone without payments or authorization', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: 'https://example.com/mcp' },
    }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('Payments:')
    expect(output).not.toContain('Authorization:')
    expect(output).toContain('MCP: https://example.com/mcp')
  })

  it('includes all three blocks together', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402', 'mpp'], ...allBacking },
      authorization: { enabled: true, identityRequired: true },
      mcp: { endpoints: ['https://example.com/mcp', 'https://example.com/mcp-premium'] },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: x402, mpp')
    expect(output).toContain('Authorization: agent-auth')
    expect(output).toContain('Identity: required')
    expect(output).toContain('MCP: https://example.com/mcp')
    expect(output).toContain('MCP: https://example.com/mcp-premium')
  })
})

describe('generateAgentsTxt — Skills block', () => {
  it('omits Skills block when skills not configured', () => {
    const output = generateAgentsTxt(baseConfig)
    expect(output).not.toContain('Skills:')
  })

  it('emits a single Skills: line for a string URL', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: { urls: 'https://example.com/skills/main/SKILL.md' },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Skills: https://example.com/skills/main/SKILL.md')
  })

  it('emits a single Skills: line for a one-item array', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: { urls: ['https://example.com/skills/main/SKILL.md'] },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Skills: https://example.com/skills/main/SKILL.md')
  })

  it('emits multiple Skills: lines in order for multiple URLs', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: { urls: ['https://example.com/skills/main/SKILL.md', 'https://example.com/skills/premium/SKILL.md'] },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Skills: https://example.com/skills/main/SKILL.md\nSkills: https://example.com/skills/premium/SKILL.md')
  })

  it('has a blank line between JSON comment and Skills block when no other blocks', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: { urls: 'https://example.com/skills/main/SKILL.md' },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('# JSON: https://example.com/agents.json\n\nSkills:')
  })

  it('has a blank line between MCP block and Skills block', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      mcp: { endpoints: 'https://example.com/mcp' },
      skills: { urls: 'https://example.com/skills/main/SKILL.md' },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('MCP: https://example.com/mcp\n\nSkills:')
  })

  it('works standalone without payments, authorization, or MCP', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      skills: { urls: 'https://example.com/skills/main/SKILL.md' },
    }
    const output = generateAgentsTxt(config)
    expect(output).not.toContain('Payments:')
    expect(output).not.toContain('Authorization:')
    expect(output).not.toContain('MCP:')
    expect(output).toContain('Skills: https://example.com/skills/main/SKILL.md')
  })

  it('includes all four blocks together', () => {
    const config: AgenticConfig = {
      site: baseConfig.site,
      payments: { protocols: ['x402', 'mpp'], ...allBacking },
      authorization: { enabled: true, identityRequired: true },
      mcp: { endpoints: 'https://example.com/mcp' },
      skills: { urls: ['https://example.com/skills/main/SKILL.md', 'https://example.com/skills/premium/SKILL.md'] },
    }
    const output = generateAgentsTxt(config)
    expect(output).toContain('Protocols: x402, mpp')
    expect(output).toContain('Authorization: agent-auth')
    expect(output).toContain('Identity: required')
    expect(output).toContain('MCP: https://example.com/mcp')
    expect(output).toContain('Skills: https://example.com/skills/main/SKILL.md')
    expect(output).toContain('Skills: https://example.com/skills/premium/SKILL.md')
  })
})
