// ─────────────────────────────────────────────────────────────────────────────
// MCP Server Card generator — /.well-known/mcp/server-card.json (SEP-2127)
//
// SEP-2127 publishes one card per MCP server describing serverInfo, the
// streamable-HTTP transport endpoint, and capability flags. The card is a
// static discovery artefact: agents read it before opening a session to
// pre-check what the server supports.
//
// The transport endpoint is taken from the first entry in `config.mcp.endpoints`.
// Multiple endpoints are allowed in `agents.json`, but the card describes a
// single server identity; sites with multiple MCP servers should publish one
// card per server at distinct paths and link them from the API catalog.
//
// Honest-declarations rule: this generator returns null when `config.mcp` or
// `config.mcp.serverCard` is absent. The CLI emit step skips the file when
// null is returned.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig } from './types.js'

function firstEndpointUrl(config: AgenticConfig): string | null {
  if (!config.mcp) return null
  const list = Array.isArray(config.mcp.endpoints) ? config.mcp.endpoints : [config.mcp.endpoints]
  const first = list[0]
  if (first === undefined) return null
  return typeof first === 'string' ? first : first.url
}

export function generateMcpServerCard(config: AgenticConfig): string | null {
  if (!config.mcp?.serverCard) return null
  const endpoint = firstEndpointUrl(config)
  if (!endpoint) return null

  const card = {
    serverInfo: {
      name:    config.mcp.serverCard.name,
      version: config.mcp.serverCard.version,
      ...(config.mcp.serverCard.description ? { description: config.mcp.serverCard.description } : {}),
    },
    transport: {
      endpoint,
      type: 'streamable-http',
    },
    capabilities: {
      tools:     config.mcp.serverCard.capabilities.tools,
      resources: config.mcp.serverCard.capabilities.resources,
      prompts:   config.mcp.serverCard.capabilities.prompts,
    },
  }

  return JSON.stringify(card, null, 2) + '\n'
}
