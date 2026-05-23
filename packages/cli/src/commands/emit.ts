import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  generateRobotsTxt,
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateAgentsTxt,
  generateAgentsJson,
  generateSecurityTxt,
  generateSitemapXml,
  generateHeadersFile,
  generateApiCatalog,
  generateMcpServerCard,
  generateAgentSkillsIndex,
  generateOpenApiJson,
  generateX402WellKnown,
  generateSchemamapXml,
  generateWebBotAuthDirectory,
  mergeVercelHeaders,
  headersDeploymentNote,
  crawlWithFirecrawl,
  validateRobotsTxt,
  validateLlmsTxt,
  validateAgentsTxt,
  validateAgentsJson,
  validateSecurityTxt,
  validateSitemapXml,
  ROBOTS_GENERATED_MARKER,
  resolveActiveProtocols,
  type AgenticConfig,
  type HostingPlatform,
  type PageEntry,
  type ValidationResult,
} from '@agentstxtdev/herald-core'
import { AgenticConfigSchema } from '../config-schema.js'
import { detectProject } from '../project-probe.js'

interface EmitOptions {
  config: string
  out: string
  robots?: boolean
  llms?: boolean
  llmsFull?: boolean
  agents?: boolean
  sitemap?: boolean
  headers?: boolean
  security?: boolean
  skipRobots?: boolean
  skipLlms?: boolean
  skipLlmsFull?: boolean
  skipAgents?: boolean
  skipSitemap?: boolean
  skipHeaders?: boolean
  skipSecurity?: boolean
  discovery?: boolean
  skipDiscovery?: boolean
  /** Override the detected hosting platform (cloudflare|netlify|vercel|unknown). */
  platform?: string
}

type Output = 'robots' | 'llms' | 'llms-full' | 'agents' | 'sitemap' | 'headers' | 'security' | 'discovery'

const OK = '✔'      // ✔
const WARN = '⚠'    // ⚠
const FAIL = '✗'    // ✗

class EmitError extends Error {
  constructor(public summary: string, public details?: string[]) {
    super(summary)
  }
}

async function loadConfig(configPath: string): Promise<AgenticConfig> {
  const abs = resolve(configPath)
  if (!existsSync(abs)) {
    throw new EmitError(`Config not found at ${abs}`, ['Run `herald init` to create one.'])
  }

  let raw: unknown
  try {
    const mod = await import(abs) as { default?: unknown } | unknown
    raw = (typeof mod === 'object' && mod !== null && 'default' in mod)
      ? (mod as { default: unknown }).default
      : mod
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new EmitError(`Could not import ${abs}`, [msg])
  }

  const result = AgenticConfigSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const path = i.path.join('.')
      // If the message already includes the field path, don't repeat it.
      if (path && i.message.startsWith(path)) return i.message
      return path ? `${path}: ${i.message}` : i.message
    })
    throw new EmitError(`Invalid agentsjson.config.js`, issues)
  }

  return result.data as AgenticConfig
}

function resolveOutputs(options: EmitOptions, config: AgenticConfig): Set<Output> {
  const hasPositive =
    options.robots || options.llms || options.llmsFull || options.agents || options.sitemap || options.headers || options.security || options.discovery

  const enabled = new Set<Output>()

  if (hasPositive) {
    if (options.robots)    enabled.add('robots')
    if (options.llms)      enabled.add('llms')
    if (options.llmsFull)  enabled.add('llms-full')
    if (options.agents)    enabled.add('agents')
    if (options.sitemap)   enabled.add('sitemap')
    if (options.headers)   enabled.add('headers')
    if (options.security)  enabled.add('security')
    if (options.discovery) enabled.add('discovery')
  } else {
    enabled.add('robots')
    enabled.add('llms')
    enabled.add('agents')
    enabled.add('headers')
    if (config.content?.fullTxt) enabled.add('llms-full')
    const driverType = config.content?.driver?.type
    if (driverType === 'static' || driverType === 'manual') enabled.add('sitemap')
    if (config.security?.contact) enabled.add('security')
    // Discovery surfaces (API catalog, MCP server card, agent-skills index)
    // emit when any of their source blocks is present. Each file has its own
    // gate inside the generator; the umbrella flag just admits them to the set.
    if (config.mcp || config.a2a || config.ucp || config.skills) enabled.add('discovery')
  }

  if (options.skipRobots)    enabled.delete('robots')
  if (options.skipLlms)      enabled.delete('llms')
  if (options.skipLlmsFull)  enabled.delete('llms-full')
  if (options.skipAgents)    enabled.delete('agents')
  if (options.skipSitemap)   enabled.delete('sitemap')
  if (options.skipHeaders)   enabled.delete('headers')
  if (options.skipSecurity)  enabled.delete('security')
  if (options.skipDiscovery) enabled.delete('discovery')

  return enabled
}

const VALID_PLATFORMS: readonly HostingPlatform[] = ['cloudflare', 'netlify', 'vercel', 'unknown']

function resolvePlatform(options: EmitOptions): HostingPlatform {
  if (options.platform) {
    const p = options.platform.toLowerCase() as HostingPlatform
    if (VALID_PLATFORMS.includes(p)) return p
    console.warn(`  ${WARN} unknown --platform "${options.platform}"; falling back to detection`)
  }
  return detectProject().hostingPlatform
}

function pad(label: string, width = 12): string {
  return label.length >= width ? label + '  ' : label + ' '.repeat(width - label.length)
}

const FILE_COL = 26

function listEntries<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function describeContent(config: AgenticConfig): string {
  const d = config.content?.driver
  if (!d) return 'none'
  switch (d.type) {
    case 'sitemap':   return `sitemap  ·  ${d.sitemapUrl}`
    case 'firecrawl': return `firecrawl  ·  ${d.siteUrl}`
    case 'static':    return `static  ·  ${(d.pages?.length ?? 0) + (d.sections ?? []).reduce((n, s) => n + s.pages.length, 0)} pages`
    case 'manual':    return `manual  ·  ${(d.sections ?? []).reduce((n, s) => n + s.pages.length, 0)} pages`
  }
}

function describeCrawlers(config: AgenticConfig): string {
  const c = config.crawlers
  if (!c) return 'defaults'
  const bits: string[] = []
  if (c.blockFreeAiScrapers) bits.push('block free AI scrapers')
  if (c.allowSearchEngines) bits.push('allow search engines')
  if (c.allowPaidAgents) bits.push('allow paid agents')
  return bits.length ? bits.join('; ') : 'none'
}

function printConfigSummary(config: AgenticConfig, configPath: string): void {
  console.log()
  console.log(`herald emit  ·  ${configPath}`)
  console.log()
  console.log('Config')
  console.log(`  ${pad('Site')}${config.site.name}  (${config.site.url})`)
  console.log(`  ${pad('Content')}${describeContent(config)}`)
  console.log(`  ${pad('Crawlers')}${describeCrawlers(config)}`)

  if (config.payments) {
    const active = resolveActiveProtocols(config.payments)
    if (active.length > 0) {
      console.log(`  ${pad('Payments')}${active.join(', ')}`)
    } else if ((config.payments.protocols ?? []).length > 0) {
      console.log(`  ${pad('Payments')}${WARN} none active (listed in protocols but missing credentials)`)
    }
  }

  if (config.authorization?.enabled) {
    const protos = (config.authorization.protocols ?? []).join(', ') || 'agent-auth'
    console.log(`  ${pad('Auth')}${protos}`)
  }

  const mcp = listEntries(config.mcp?.endpoints)
  if (mcp.length > 0) console.log(`  ${pad('MCP')}${mcp.length} endpoint${mcp.length === 1 ? '' : 's'}`)

  const skills = listEntries(config.skills?.urls)
  if (skills.length > 0) console.log(`  ${pad('Skills')}${skills.length} url${skills.length === 1 ? '' : 's'}`)

  const a2a = listEntries(config.a2a?.cards)
  if (a2a.length > 0) console.log(`  ${pad('A2A')}${a2a.length} card${a2a.length === 1 ? '' : 's'}`)

  const ucp = listEntries(config.ucp?.profiles)
  if (ucp.length > 0) console.log(`  ${pad('UCP')}${ucp.length} profile${ucp.length === 1 ? '' : 's'}`)

  const webmcp = listEntries(config.webmcp?.pages)
  if (webmcp.length > 0) console.log(`  ${pad('WebMCP')}${webmcp.length} page${webmcp.length === 1 ? '' : 's'}`)

  if (config.security?.contact) {
    console.log(`  ${pad('Security')}${config.security.contact}`)
  }
}

function printValidation(results: ValidationResult[]): void {
  for (const r of results.filter((v) => v.status !== 'pass')) {
    const marker = r.status === 'fail' ? FAIL : WARN
    console.log(`      ${marker} ${r.message}`)
  }
}

function writeHeadersFile(options: EmitOptions, outDir: string, config: AgenticConfig): void {
  const platform = resolvePlatform(options)
  const file = generateHeadersFile(platform, config)

  const targetPath = file.pathRelativeTo === 'out'
    ? join(outDir, file.filename)
    : resolve(process.cwd(), file.filename)

  if (file.strategy === 'merge-json' && existsSync(targetPath)) {
    let existing: { headers?: unknown; [k: string]: unknown } = {}
    try {
      existing = JSON.parse(readFileSync(targetPath, 'utf-8')) as typeof existing
    } catch {
      console.log(`  ${WARN} existing ${file.filename} is not valid JSON; leaving it in place`)
      return
    }
    const merged = { ...existing, headers: mergeVercelHeaders(existing.headers, config) }
    writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
    console.log(`  ${OK} ${pad(file.filename, FILE_COL)}(merged into ${targetPath}; existing entries preserved)`)
  } else {
    writeFileSync(targetPath, file.content, 'utf-8')
    console.log(`  ${OK} ${pad(file.filename, FILE_COL)}(${platform})`)
  }
  console.log(`      ${headersDeploymentNote(platform)}`)
}

export async function emitCommand(options: EmitOptions): Promise<void> {
  let config: AgenticConfig
  try {
    config = await loadConfig(options.config)
  } catch (err) {
    console.error()
    console.error(`${FAIL} herald emit failed`)
    console.error()
    if (err instanceof EmitError) {
      console.error(`  ${err.summary}`)
      for (const d of err.details ?? []) console.error(`    • ${d}`)
    } else {
      console.error(`  ${err instanceof Error ? err.message : String(err)}`)
    }
    console.error()
    process.exit(1)
  }

  printConfigSummary(config, options.config)

  const outDir = resolve(options.out)
  mkdirSync(outDir, { recursive: true })

  const outputs = resolveOutputs(options, config)

  console.log()
  console.log(`Emitting to ${options.out}`)

  let written = 0

  // ── robots.txt ────────────────────────────────────────────────────────────
  if (outputs.has('robots')) {
    const robotsPath = join(outDir, 'robots.txt')
    let existingRobots: string | undefined
    let mergedExisting = false
    if (existsSync(robotsPath)) {
      const raw = readFileSync(robotsPath, 'utf-8')
      const EXISTING_RULES_MARKER = '# ── Existing rules (preserved) ──────────────────────────────'
      if (raw.includes(ROBOTS_GENERATED_MARKER)) {
        const markerIdx = raw.indexOf(EXISTING_RULES_MARKER)
        if (markerIdx !== -1) {
          const tail = raw.slice(markerIdx + EXISTING_RULES_MARKER.length).trim()
          existingRobots = tail || undefined
        }
      } else {
        existingRobots = raw
        mergedExisting = true
      }
    }
    const robotsTxt = generateRobotsTxt(config, existingRobots)
    writeFileSync(robotsPath, robotsTxt, 'utf-8')
    const note = mergedExisting ? '(merged with existing rules)' : ''
    console.log(`  ${OK} ${pad('robots.txt', FILE_COL)}${note}`)
    printValidation(validateRobotsTxt(robotsTxt, config))
    written++
  }

  // ── llms.txt ──────────────────────────────────────────────────────────────
  if (outputs.has('llms')) {
    try {
      const llmsTxt = await generateLlmsTxt(config)
      writeFileSync(join(outDir, 'llms.txt'), llmsTxt, 'utf-8')
      console.log(`  ${OK} ${pad('llms.txt', FILE_COL)}`)
      printValidation(validateLlmsTxt(llmsTxt))
      written++
    } catch (err) {
      console.log(`  ${FAIL} ${pad('llms.txt', FILE_COL)}${err instanceof Error ? err.message : String(err)}`)
      console.log(`      Configure content.driver, or pass --skip-llms`)
    }
  }

  // ── llms-full.txt ─────────────────────────────────────────────────────────
  if (outputs.has('llms-full')) {
    if (!config.content?.fullTxt) {
      console.log(`  ${WARN} ${pad('llms-full.txt', FILE_COL)}skipped: content.fullTxt is not configured`)
    } else {
      try {
        const llmsFullTxt = await generateLlmsFullTxt(config)
        writeFileSync(join(outDir, 'llms-full.txt'), llmsFullTxt, 'utf-8')
        const sourceType = config.content.fullTxt.driver.type
        const note = sourceType === 'firecrawl' ? '(scraped via Firecrawl)' : `(${sourceType} source, link-list only)`
        console.log(`  ${OK} ${pad('llms-full.txt', FILE_COL)}${note}`)
        written++
      } catch (err) {
        console.log(`  ${FAIL} ${pad('llms-full.txt', FILE_COL)}${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // ── sitemap.xml ───────────────────────────────────────────────────────────
  if (outputs.has('sitemap')) {
    const driver = config.content?.driver
    const driverType = driver?.type

    if (driverType === 'sitemap') {
      console.log(`  ${WARN} ${pad('sitemap.xml', FILE_COL)}skipped: driver is 'sitemap' (would overwrite the source)`)
    } else {
      try {
        let pages: PageEntry[] = []
        if (driver?.type === 'static') {
          pages = [...driver.pages, ...(driver.sections ?? []).flatMap((s) => s.pages)]
        } else if (driver?.type === 'manual') {
          pages = driver.sections.flatMap((s) => s.pages)
        } else if (driver?.type === 'firecrawl') {
          pages = await crawlWithFirecrawl(driver)
        }

        if (pages.length === 0) {
          console.log(`  ${WARN} ${pad('sitemap.xml', FILE_COL)}skipped: no pages resolved from content driver`)
        } else {
          const sitemapXml = generateSitemapXml(pages)
          writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml, 'utf-8')
          console.log(`  ${OK} ${pad('sitemap.xml', FILE_COL)}(${pages.length} URL${pages.length === 1 ? '' : 's'})`)
          printValidation(validateSitemapXml(sitemapXml))
          written++
        }
      } catch (err) {
        console.log(`  ${FAIL} ${pad('sitemap.xml', FILE_COL)}${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // ── agents.txt + agents.json ──────────────────────────────────────────────
  if (outputs.has('agents')) {
    const agentsTxt = generateAgentsTxt(config)
    writeFileSync(join(outDir, 'agents.txt'), agentsTxt, 'utf-8')
    console.log(`  ${OK} ${pad('agents.txt', FILE_COL)}`)
    printValidation(validateAgentsTxt(agentsTxt))
    written++

    const agentsJson = generateAgentsJson(config)
    writeFileSync(join(outDir, 'agents.json'), agentsJson, 'utf-8')
    console.log(`  ${OK} ${pad('agents.json', FILE_COL)}`)
    printValidation(validateAgentsJson(agentsJson))
    written++
  }

  // ── /.well-known/security.txt (RFC 9116) ──────────────────────────────────
  if (outputs.has('security')) {
    try {
      const body = generateSecurityTxt(config)
      if (body) {
        const wellKnownDir = join(outDir, '.well-known')
        if (!existsSync(wellKnownDir)) mkdirSync(wellKnownDir, { recursive: true })
        writeFileSync(join(wellKnownDir, 'security.txt'), body, 'utf-8')
        console.log(`  ${OK} ${pad('.well-known/security.txt', FILE_COL)}`)
        for (const issue of validateSecurityTxt(body)) {
          console.log(`      ${WARN} ${issue}`)
        }
        written++
      } else {
        console.log(`  ${WARN} ${pad('security.txt', FILE_COL)}skipped: security.contact not set`)
      }
    } catch (err) {
      console.log(`  ${FAIL} ${pad('security.txt', FILE_COL)}${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Discovery surfaces: api-catalog, mcp/server-card, agent-skills/index ──
  if (outputs.has('discovery')) {
    const wellKnownDir = join(outDir, '.well-known')
    if (!existsSync(wellKnownDir)) mkdirSync(wellKnownDir, { recursive: true })

    // RFC 9727 API catalog — emit whenever any mcp/a2a/ucp block is configured.
    if (config.mcp || config.a2a || config.ucp) {
      const catalog = generateApiCatalog(config)
      writeFileSync(join(wellKnownDir, 'api-catalog'), catalog, 'utf-8')
      console.log(`  ${OK} ${pad('.well-known/api-catalog', FILE_COL)}`)
      written++
    }

    // SEP-2127 MCP server card — emit only when serverCard metadata exists.
    const mcpCard = generateMcpServerCard(config)
    if (mcpCard) {
      const mcpDir = join(wellKnownDir, 'mcp')
      if (!existsSync(mcpDir)) mkdirSync(mcpDir, { recursive: true })
      writeFileSync(join(mcpDir, 'server-card.json'), mcpCard, 'utf-8')
      console.log(`  ${OK} ${pad('.well-known/mcp/server-card.json', FILE_COL)}`)
      written++
    } else if (config.mcp && !config.mcp.serverCard) {
      console.log(`  ${WARN} ${pad('.well-known/mcp/server-card.json', FILE_COL)}skipped: mcp.serverCard not set in config`)
    }

    // Cloudflare Agent Skills Discovery v0.2.0 index — emit only when at least
    // one skill entry carries a digest. The generator warns per-entry otherwise.
    const skillsIndex = generateAgentSkillsIndex(config)
    if (skillsIndex) {
      const skillsDir = join(wellKnownDir, 'agent-skills')
      if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true })
      writeFileSync(join(skillsDir, 'index.json'), skillsIndex, 'utf-8')
      console.log(`  ${OK} ${pad('.well-known/agent-skills/index.json', FILE_COL)}`)
      written++
    } else if (config.skills) {
      console.log(`  ${WARN} ${pad('.well-known/agent-skills/index.json', FILE_COL)}skipped: no skill entries with digest`)
    }

    // MPP / Payment Discovery /openapi.json. Independent of the per-protocol
    // env-var gate that drives agents.json: this file is a discovery surface,
    // not a payment activation signal.
    const openapi = generateOpenApiJson(config)
    if (openapi) {
      writeFileSync(join(outDir, 'openapi.json'), openapi, 'utf-8')
      console.log(`  ${OK} ${pad('openapi.json', FILE_COL)}`)
      written++
    }

    // /.well-known/x402 — convenience x402 discovery surface. Mirrors the
    // payments.x402 block from agents.json; the x402 spec does not mandate
    // the path, but AEO scanners probe it.
    const x402 = generateX402WellKnown(config)
    if (x402) {
      writeFileSync(join(wellKnownDir, 'x402'), x402, 'utf-8')
      console.log(`  ${OK} ${pad('.well-known/x402', FILE_COL)}`)
      written++
    }

    // /schemamap.xml — NLWeb Schema Map. Lists every schema-bearing surface
    // the site publishes. Derived entirely from which blocks the config
    // declares; no new config field.
    const schemamap = generateSchemamapXml(config)
    if (schemamap) {
      writeFileSync(join(outDir, 'schemamap.xml'), schemamap, 'utf-8')
      console.log(`  ${OK} ${pad('schemamap.xml', FILE_COL)}`)
      written++
    }

    // /.well-known/http-message-signatures-directory — Web Bot Auth JWKSet.
    // Gated on `webBotAuth.keys`; honest-declarations rule applies.
    const webBotAuth = generateWebBotAuthDirectory(config)
    if (webBotAuth) {
      writeFileSync(join(wellKnownDir, 'http-message-signatures-directory'), webBotAuth, 'utf-8')
      console.log(`  ${OK} ${pad('.well-known/http-message-signatures-directory', FILE_COL)}`)
      written++
    } else if (config.webBotAuth) {
      console.log(`  ${WARN} ${pad('.well-known/http-message-signatures-directory', FILE_COL)}skipped: webBotAuth.keys is empty`)
    }
  }

  // ── §4.5 headers config (platform-specific) ───────────────────────────────
  if (outputs.has('headers')) {
    try {
      writeHeadersFile(options, outDir, config)
      written++
    } catch (err) {
      console.log(`  ${FAIL} ${pad('_headers', FILE_COL)}${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log()
  console.log(`Done  ·  ${written} file${written === 1 ? '' : 's'}`)
  console.log()
  const baseUrl = config.site.url.replace(/\/$/, '')
  console.log(`  ${pad('Verify')}herald check ${baseUrl}`)
  console.log()
}
