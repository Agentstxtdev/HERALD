import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// Project probe — pure filesystem reads, no I/O side effects beyond reading.
// Returns a description of the detected project environment so the init wizard
// can pre-fill answers without knowing how detection works.
// ─────────────────────────────────────────────────────────────────────────────

export interface Detected {
  framework: 'nextjs' | 'express' | 'hono' | 'astro' | 'unknown'
  siteName: string
  siteUrl: string
  hasSitemap: boolean
  sitemapUrl: string
  hasExistingRobots: boolean
  hasExistingLlms: boolean
  envEvmAddress: string
  envSolanaAddress: string
  envStripeKey: string
  envTempoKey: string
  envFirecrawlKey: string
}

export function detectProject(): Detected {
  const cwd = process.cwd()

  // Read package.json if present
  let pkgName = ''
  let pkgDeps: Record<string, string> = {}
  const pkgPath = resolve(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        name?: string
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      pkgName = pkg.name ?? ''
      pkgDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    } catch { /* ignore */ }
  }

  // Detect framework
  let framework: Detected['framework'] = 'unknown'
  if (pkgDeps['next']) framework = 'nextjs'
  else if (pkgDeps['express']) framework = 'express'
  else if (pkgDeps['hono']) framework = 'hono'
  else if (pkgDeps['astro'] || pkgDeps['@astrojs/core']) framework = 'astro'

  // Detect sitemap
  const sitemapCandidates = [
    resolve(cwd, 'public', 'sitemap.xml'),
    resolve(cwd, 'static', 'sitemap.xml'),
    resolve(cwd, 'out', 'sitemap.xml'),
    resolve(cwd, 'dist', 'sitemap.xml'),
    resolve(cwd, 'sitemap.xml'),
  ]
  const hasSitemap = sitemapCandidates.some(existsSync)

  // Detect existing agentic files
  const publicDir = existsSync(resolve(cwd, 'public')) ? 'public' : 'static'
  const hasExistingRobots = existsSync(resolve(cwd, publicDir, 'robots.txt'))
  const hasExistingLlms = existsSync(resolve(cwd, publicDir, 'llms.txt'))

  // Read env vars if .env exists
  let envContent = ''
  const envPaths = ['.env', '.env.local', '.env.production']
  for (const p of envPaths) {
    if (existsSync(resolve(cwd, p))) {
      envContent += readFileSync(resolve(cwd, p), 'utf-8') + '\n'
      break
    }
  }
  const getEnv = (key: string): string => {
    const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'))
    return match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? process.env[key] ?? ''
  }

  return {
    framework,
    siteName: pkgName
      .split(/[-_/]/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ') || 'My Site',
    siteUrl: getEnv('NEXT_PUBLIC_SITE_URL') || getEnv('SITE_URL') || 'https://example.com',
    hasSitemap,
    sitemapUrl: hasSitemap ? '/sitemap.xml' : '',
    hasExistingRobots,
    hasExistingLlms,
    envEvmAddress: getEnv('EVM_ADDRESS') || getEnv('TREASURY_ADDRESS'),
    envSolanaAddress: getEnv('SOLANA_ADDRESS'),
    envStripeKey: getEnv('STRIPE_SECRET_KEY'),
    envTempoKey: getEnv('TEMPO_API_KEY'),
    envFirecrawlKey: getEnv('FIRECRAWL_API_KEY'),
  }
}
