import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

function setupNoFiles() {
  mockExistsSync.mockReturnValue(false)
  mockReadFileSync.mockReturnValue('')
}

function setupPackageJson(pkg: Record<string, unknown>) {
  mockExistsSync.mockImplementation((p: unknown) => {
    return typeof p === 'string' && p.endsWith('package.json')
  })
  mockReadFileSync.mockImplementation((p: unknown) => {
    if (typeof p === 'string' && p.endsWith('package.json')) {
      return JSON.stringify(pkg)
    }
    return ''
  })
}

describe('detectProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns unknown framework when no package.json', async () => {
    setupNoFiles()
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.framework).toBe('unknown')
  })

  it('detects nextjs framework from next dependency', async () => {
    setupPackageJson({ name: 'my-app', dependencies: { next: '^14.0.0' } })
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.framework).toBe('nextjs')
  })

  it('detects express framework from express dependency', async () => {
    setupPackageJson({ name: 'my-api', dependencies: { express: '^4.0.0' } })
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.framework).toBe('express')
  })

  it('detects hono framework from hono dependency', async () => {
    setupPackageJson({ name: 'my-api', dependencies: { hono: '^4.0.0' } })
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.framework).toBe('hono')
  })

  it('detects astro framework from astro dependency', async () => {
    setupPackageJson({ name: 'my-site', dependencies: { astro: '^3.0.0' } })
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.framework).toBe('astro')
  })

  it('converts kebab-case package name to Title Case site name', async () => {
    setupPackageJson({ name: 'my-awesome-site' })
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.siteName).toBe('My Awesome Site')
  })

  it('falls back to My Site when package.json has no name', async () => {
    setupPackageJson({})
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.siteName).toBe('My Site')
  })

  it('defaults siteUrl to https://example.com when no env vars', async () => {
    setupNoFiles()
    // ensure env vars are cleared
    const savedUrl = process.env['SITE_URL']
    const savedNextUrl = process.env['NEXT_PUBLIC_SITE_URL']
    delete process.env['SITE_URL']
    delete process.env['NEXT_PUBLIC_SITE_URL']
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.siteUrl).toBe('https://example.com')
    process.env['SITE_URL'] = savedUrl
    process.env['NEXT_PUBLIC_SITE_URL'] = savedNextUrl
  })

  it('reports hasSitemap false when no sitemap.xml found', async () => {
    setupNoFiles()
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.hasSitemap).toBe(false)
    expect(result.sitemapUrl).toBe('')
  })

  it('reports hasSitemap true when sitemap.xml exists', async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      return typeof p === 'string' && p.includes('sitemap.xml')
    })
    mockReadFileSync.mockReturnValue('')
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.hasSitemap).toBe(true)
    expect(result.sitemapUrl).toBe('/sitemap.xml')
  })

  it('reads EVM_ADDRESS from .env file', async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      return typeof p === 'string' && p.endsWith('.env')
    })
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.endsWith('.env')) {
        return 'EVM_ADDRESS=0x1234567890123456789012345678901234567890\n'
      }
      return ''
    })
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.envEvmAddress).toBe('0x1234567890123456789012345678901234567890')
  })

  it('strips surrounding quotes from env values', async () => {
    mockExistsSync.mockImplementation((p: unknown) => typeof p === 'string' && p.endsWith('.env'))
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.endsWith('.env')) {
        return 'FIRECRAWL_API_KEY="fc-secret-key"\n'
      }
      return ''
    })
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    expect(result.envFirecrawlKey).toBe('fc-secret-key')
  })

  it('returns a Detected object with all expected fields', async () => {
    setupNoFiles()
    const { detectProject } = await import('../project-probe.js')
    const result = detectProject()
    const expectedKeys: Array<keyof typeof result> = [
      'framework', 'hostingPlatform', 'siteName', 'siteUrl', 'hasSitemap', 'sitemapUrl',
      'hasExistingRobots', 'hasExistingLlms',
      'envEvmAddress', 'envSolanaAddress', 'envStripeKey', 'envTempoKey', 'envFirecrawlKey',
    ]
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key)
    }
  })
})
