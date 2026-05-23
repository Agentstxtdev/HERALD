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

  // SEP-2127 publishes the canonical fields nested under `serverInfo`,
  // `transport`, and `capabilities`. Some agent-readiness scanners
  // (ora.ai / orank, others that pre-date the SEP) probe a flat shape and
  // miss the nested values, reporting "missing fields: name, description,
  // version" even when they are present underneath. The card below carries
  // both shapes so a flat-reading scanner finds the strings at the top
  // level while a SEP-conforming reader still gets the structured tree.
  // `tools[]` is published when the adopter declares the tool set, letting
  // an agent preview the server before opening a transport connection.
  const sc = config.mcp.serverCard
  const card = {
    name:        sc.name,
    description: sc.description,
    version:     sc.version,
    serverUrl:   endpoint,
    ...(sc.tools && sc.tools.length > 0 ? { tools: sc.tools.map((t) => ({
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
    })) } : {}),
    serverInfo: {
      name:    sc.name,
      version: sc.version,
      ...(sc.description ? { description: sc.description } : {}),
    },
    transport: {
      endpoint,
      type: 'streamable-http',
    },
    capabilities: {
      tools:     sc.capabilities.tools,
      resources: sc.capabilities.resources,
      prompts:   sc.capabilities.prompts,
    },
  }

  return JSON.stringify(card, null, 2) + '\n'
}
