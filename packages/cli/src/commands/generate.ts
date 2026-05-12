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
  mergeVercelHeaders,
  headersDeploymentNote,
  headersDevSnippet,
  type DevFramework,
  parseSitemap,
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
} from '@herald/core'
import { AgenticConfigSchema } from '../config-schema.js'
import { detectProject } from '../project-probe.js'

interface GenerateOptions {
  config: string
  out: string
  // Positive selectors — when any are passed, only those outputs are emitted.
  robots?: boolean
  llms?: boolean
  llmsFull?: boolean
  agents?: boolean
  sitemap?: boolean
  headers?: boolean
  security?: boolean
  // Negative selectors — subtracted from whatever the positive set resolves to.
  skipRobots?: boolean
  skipLlms?: boolean
  skipLlmsFull?: boolean
  skipAgents?: boolean
  skipSitemap?: boolean
  skipHeaders?: boolean
  skipSecurity?: boolean
  /** Override the detected hosting platform (cloudflare|netlify|vercel|unknown). */
  platform?: string
}

type Output = 'robots' | 'llms' | 'llms-full' | 'agents' | 'sitemap' | 'headers' | 'security'

async function loadConfig(configPath: string): Promise<AgenticConfig> {
  const abs = resolve(configPath)
  if (!existsSync(abs)) {
    throw new Error(
      `Config not found at ${abs}.\nRun \`herald init\` to create one.`,
    )
  }

  try {
    const mod = await import(abs) as { default?: unknown } | unknown
    const raw = (typeof mod === 'object' && mod !== null && 'default' in mod)
      ? (mod as { default: unknown }).default
      : mod

    const result = AgenticConfigSchema.safeParse(raw)
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n')
      throw new Error(`Invalid agentsjson.config.js:\n${issues}`)
    }

    return result.data as AgenticConfig
  } catch (err) {
    throw new Error(`Failed to load config: ${String(err)}`)
  }
}

function resolveOutputs(options: GenerateOptions, config: AgenticConfig): Set<Output> {
  // Positive selectors win when present: an explicit `--agents` means
  // "only agents", regardless of what would be emitted by default.
  const hasPositive =
    options.robots || options.llms || options.llmsFull || options.agents || options.sitemap || options.headers || options.security

  const enabled = new Set<Output>()

  if (hasPositive) {
    if (options.robots)   enabled.add('robots')
    if (options.llms)     enabled.add('llms')
    if (options.llmsFull) enabled.add('llms-full')
    if (options.agents)   enabled.add('agents')
    if (options.sitemap)  enabled.add('sitemap')
    if (options.headers)  enabled.add('headers')
    if (options.security) enabled.add('security')
  } else {
    // Default: everything that makes sense for this config.
    enabled.add('robots')
    enabled.add('llms')
    enabled.add('agents')
    enabled.add('headers')
    if (config.content?.fullTxt) enabled.add('llms-full')
    const driverType = config.content?.driver?.type
    if (driverType === 'static' || driverType === 'manual') enabled.add('sitemap')
    // security.txt only when a security block exists. Honest defaults: we do not
    // emit a placeholder file for sites that have not declared a disclosure
    // contact, since an empty/expired security.txt is worse than none.
    if (config.security?.contact) enabled.add('security')
  }

  // Negative selectors subtract — same semantics whether or not positive flags
  // were passed, so `--agents --skip-llms-full` is well-defined (no-op here).
  if (options.skipRobots)   enabled.delete('robots')
  if (options.skipLlms)     enabled.delete('llms')
  if (options.skipLlmsFull) enabled.delete('llms-full')
  if (options.skipAgents)   enabled.delete('agents')
  if (options.skipSitemap)  enabled.delete('sitemap')
  if (options.skipHeaders)  enabled.delete('headers')
  if (options.skipSecurity) enabled.delete('security')

  return enabled
}

const VALID_PLATFORMS: readonly HostingPlatform[] = ['cloudflare', 'netlify', 'vercel', 'unknown']

function resolvePlatform(options: GenerateOptions): HostingPlatform {
  if (options.platform) {
    const p = options.platform.toLowerCase() as HostingPlatform
    if (VALID_PLATFORMS.includes(p)) return p
    console.warn(`   ⚠  Unknown --platform "${options.platform}". Falling back to detection. Valid: ${VALID_PLATFORMS.join(', ')}.`)
  }
  return detectProject().hostingPlatform
}

function writeHeadersFile(options: GenerateOptions, outDir: string, config: AgenticConfig): void {
  const platform = resolvePlatform(options)
  const file = generateHeadersFile(platform, config)

  const targetPath = file.pathRelativeTo === 'out'
    ? join(outDir, file.filename)
    : resolve(process.cwd(), file.filename)

  if (file.strategy === 'merge-json' && existsSync(targetPath)) {
    // vercel.json: parse, merge, write back. Preserves any user-authored
    // entries with a different `source`; collisions are resolved in our favour.
    let existing: { headers?: unknown; [k: string]: unknown } = {}
    try {
      existing = JSON.parse(readFileSync(targetPath, 'utf-8')) as typeof existing
    } catch (err) {
      console.warn(`   ⚠  Existing ${file.filename} is not valid JSON; not merging. (${String(err)})`)
      return
    }
    const merged = { ...existing, headers: mergeVercelHeaders(existing.headers, config) }
    writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
    console.log(`   ✔  ${file.filename} → ${targetPath}  (merged herald-managed entries; existing entries preserved)`)
  } else {
    writeFileSync(targetPath, file.content, 'utf-8')
    console.log(`   ✔  ${file.filename} → ${targetPath}  (platform: ${platform})`)
  }

  console.log(`      ${headersDeploymentNote(platform)}`)

  // Dev-parity hint: the production file we just wrote is not applied by most
  // dev servers (Vite, Express, Hono, etc.). Print a per-framework snippet so
  // the user can wire the `@herald/addon/dev` shim into their dev environment
  // and get §4.5 parity on `localhost`.
  const detectedFramework = detectProject().framework
  const devFramework: DevFramework = detectedFramework === 'unknown' ? 'unknown' : detectedFramework
  const snippet = headersDevSnippet(devFramework)
  const labelled = devFramework === 'unknown'
    ? '      Dev parity (no framework detected):'
    : `      Dev parity (detected: ${devFramework}):`
  console.log()
  console.log(labelled)
  for (const line of snippet.split('\n')) {
    console.log(`      ${line}`)
  }
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  console.log('\n🤖 herald — generating files...\n')

  let config: AgenticConfig
  try {
    config = await loadConfig(options.config)
  } catch (err) {
    console.error(`❌ ${String(err)}`)
    process.exit(1)
  }

  const outDir = resolve(options.out)
  mkdirSync(outDir, { recursive: true })

  const outputs = resolveOutputs(options, config)

  // ── robots.txt ────────────────────────────────────────────────────────────
  if (outputs.has('robots')) {
    const robotsPath = join(outDir, 'robots.txt')
    let existingRobots: string | undefined
    if (existsSync(robotsPath)) {
      const raw = readFileSync(robotsPath, 'utf-8')
      // If the file was previously generated by this tool, only preserve the
      // human-authored section that was appended below the "Existing rules" marker.
      // Without this, re-running generate would duplicate the entire generated block.
      // ROBOTS_GENERATED_MARKER is exported from @herald/core so the marker
      // string lives next to the code that emits it — single source of truth.
      const EXISTING_RULES_MARKER = '# ── Existing rules (preserved) ──────────────────────────────'
      if (raw.includes(ROBOTS_GENERATED_MARKER)) {
        const markerIdx = raw.indexOf(EXISTING_RULES_MARKER)
        if (markerIdx !== -1) {
          const tail = raw.slice(markerIdx + EXISTING_RULES_MARKER.length).trim()
          existingRobots = tail || undefined
        }
        // else: pure generated file with no user section — just overwrite cleanly
      } else {
        existingRobots = raw
        console.log(`   ⚡ Merging with existing robots.txt`)
      }
    }
    const robotsTxt = generateRobotsTxt(config, existingRobots)
    writeFileSync(robotsPath, robotsTxt, 'utf-8')
    console.log(`   ✔  robots.txt → ${robotsPath}`)
    for (const r of validateRobotsTxt(robotsTxt, config).filter((v) => v.status !== 'pass')) {
      console.warn(`      ⚠  ${r.message}`)
    }
  }

  // ── llms.txt ──────────────────────────────────────────────────────────────
  if (outputs.has('llms')) {
    try {
      const llmsTxt = await generateLlmsTxt(config)
      const llmsPath = join(outDir, 'llms.txt')
      writeFileSync(llmsPath, llmsTxt, 'utf-8')
      console.log(`   ✔  llms.txt  → ${llmsPath}`)
      for (const r of validateLlmsTxt(llmsTxt).filter((v) => v.status !== 'pass')) {
        console.warn(`      ⚠  ${r.message}`)
      }
    } catch (err) {
      console.warn(`   ⚠  llms.txt generation failed: ${String(err)}`)
      console.warn(`      Add content.driver config or pass --skip-llms`)
    }
  }

  // ── llms-full.txt ─────────────────────────────────────────────────────────
  if (outputs.has('llms-full')) {
    if (!config.content?.fullTxt) {
      console.warn(`   ⚠  llms-full.txt requested but content.fullTxt is not configured — skipping`)
    } else {
      try {
        const llmsFullTxt = await generateLlmsFullTxt(config)
        const llmsFullPath = join(outDir, 'llms-full.txt')
        writeFileSync(llmsFullPath, llmsFullTxt, 'utf-8')
        const sourceType = config.content.fullTxt.driver.type
        const note = sourceType === 'firecrawl' ? '(content scraped via Firecrawl)' : `(${sourceType} source — link-list only)`
        console.log(`   ✔  llms-full.txt → ${llmsFullPath}  ${note}`)
      } catch (err) {
        console.warn(`   ⚠  llms-full.txt generation failed: ${String(err)}`)
      }
    }
  }

  // ── sitemap.xml ───────────────────────────────────────────────────────────
  // Default policy: emit when content.driver is 'static' or 'manual' (user-supplied
  // authoritative URL list). When the user explicitly passes `--sitemap` we honor
  // that even for 'firecrawl' (curated subset). Driver type 'sitemap' is always
  // skipped because we'd be reading the file we'd overwrite.
  if (outputs.has('sitemap')) {
    const driver = config.content?.driver
    const driverType = driver?.type

    if (driverType === 'sitemap') {
      console.warn(`   ⚠  sitemap.xml: driver is 'sitemap' (circular — would overwrite the file we read). Skipping.`)
    } else {
      try {
        let pages: PageEntry[] = []
        if (driver?.type === 'static') {
          pages = [
            ...driver.pages,
            ...(driver.sections ?? []).flatMap((s) => s.pages),
          ]
        } else if (driver?.type === 'manual') {
          pages = driver.sections.flatMap((s) => s.pages)
        } else if (driver?.type === 'firecrawl') {
          pages = await crawlWithFirecrawl(driver)
        }

        if (pages.length === 0) {
          console.warn(`   ⚠  sitemap.xml: no pages resolved from content driver — skipping`)
        } else {
          const sitemapXml = generateSitemapXml(pages)
          const sitemapPath = join(outDir, 'sitemap.xml')
          writeFileSync(sitemapPath, sitemapXml, 'utf-8')
          console.log(`   ✔  sitemap.xml → ${sitemapPath}  (${pages.length} URLs)`)
          for (const r of validateSitemapXml(sitemapXml).filter((v) => v.status !== 'pass')) {
            console.warn(`      ⚠  ${r.message}`)
          }
        }
      } catch (err) {
        console.warn(`   ⚠  sitemap.xml generation failed: ${String(err)}`)
      }
    }
  }

  // ── agents.txt + agents.json ───────────────────────────────────────────────
  if (outputs.has('agents')) {
    const agentsTxt = generateAgentsTxt(config)
    const agentsTxtPath = join(outDir, 'agents.txt')
    writeFileSync(agentsTxtPath, agentsTxt, 'utf-8')
    console.log(`   ✔  agents.txt  → ${agentsTxtPath}`)
    for (const r of validateAgentsTxt(agentsTxt).filter((v) => v.status !== 'pass')) {
      console.warn(`      ⚠  ${r.message}`)
    }

    const agentsJson = generateAgentsJson(config)
    const agentsJsonPath = join(outDir, 'agents.json')
    writeFileSync(agentsJsonPath, agentsJson, 'utf-8')
    console.log(`   ✔  agents.json → ${agentsJsonPath}`)
    for (const r of validateAgentsJson(agentsJson).filter((v) => v.status !== 'pass')) {
      console.warn(`      ⚠  ${r.message}`)
    }
  }

  // ── /.well-known/security.txt (RFC 9116) ──────────────────────────────────
  // Written to <outDir>/.well-known/security.txt. The static asset pipeline of
  // every supported host (Cloudflare, Netlify, Vercel) maps the on-disk path to
  // the URL path, so no special config is needed for the file to land at the
  // canonical location.
  if (outputs.has('security')) {
    try {
      const body = generateSecurityTxt(config)
      if (body) {
        const wellKnownDir = join(outDir, '.well-known')
        if (!existsSync(wellKnownDir)) mkdirSync(wellKnownDir, { recursive: true })
        const securityPath = join(wellKnownDir, 'security.txt')
        writeFileSync(securityPath, body, 'utf-8')
        console.log(`   ✔  security.txt → ${securityPath}`)
        for (const issue of validateSecurityTxt(body)) {
          console.warn(`      ⚠  ${issue}`)
        }
      } else {
        console.warn('   ⚠  security.txt skipped: no `security.contact` in config')
      }
    } catch (err) {
      console.warn(`   ⚠  security.txt generation failed: ${String(err)}`)
    }
  }

  // ── §4.5 headers config (platform-specific) ───────────────────────────────
  // Cloudflare/Netlify: writes `_headers` into outDir; Vercel: merges
  // /agents.txt + /agents.json entries into vercel.json at project root.
  if (outputs.has('headers')) {
    try {
      writeHeadersFile(options, outDir, config)
    } catch (err) {
      console.warn(`   ⚠  Headers config emission failed: ${String(err)}`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n✅ Done!\n')
  const baseUrl = config.site.url.replace(/\/$/, '')
  console.log(`   Site:       ${config.site.url}`)
  if (outputs.has('llms'))     console.log(`   llms.txt:    ${baseUrl}/llms.txt`)
  if (outputs.has('sitemap'))  console.log(`   sitemap.xml: ${baseUrl}/sitemap.xml`)
  if (outputs.has('agents')) {
    console.log(`   agents.txt:  ${baseUrl}/agents.txt`)
    console.log(`   agents.json: ${baseUrl}/agents.json`)
  }
  if (outputs.has('security') && config.security?.contact) {
    console.log(`   security.txt: ${baseUrl}/.well-known/security.txt`)
  }

  const activeProtocols = config.payments ? resolveActiveProtocols(config.payments) : []
  if (activeProtocols.length > 0) {
    console.log(`   💰 Payments: ${activeProtocols.join(', ')}`)
  } else {
    console.log(`   💡 No payment protocols configured. Add wallet credentials to monetize agent access.`)
  }
  console.log()
}
