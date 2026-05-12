// Compliance checker — verifies a site exposes all required agentic web files
import { validateRobotsTxt, validateLlmsTxt, validateAgentsTxt, validateAgentsJson, validateSitemapXml } from '@herald/core'

interface CheckResult {
  file: string
  url: string
  status: 'ok' | 'warn' | 'fail'
  note?: string
}

async function checkUrl(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'herald-check/1.0 (+https://github.com/agentstxtdev/herald)' },
    })
    const body = await res.text()
    return { ok: res.ok, status: res.status, body }
  } catch {
    return { ok: false, status: 0, body: '' }
  }
}

export async function checkCompliance(siteUrl: string): Promise<void> {
  let base: string
  try {
    const parsed = new URL(siteUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('URL must use http or https')
    }
    base = parsed.origin + parsed.pathname.replace(/\/$/, '')
  } catch (err) {
    console.error(`❌ Invalid URL: ${siteUrl}\n   ${String(err)}`)
    process.exit(1)
  }
  console.log(`\n🤖 Checking agentic web compliance for ${base}\n`)

  const results: CheckResult[] = []

  // robots.txt
  const robots = await checkUrl(`${base}/robots.txt`)
  if (!robots.ok) {
    results.push({ file: 'robots.txt', url: `${base}/robots.txt`, status: 'fail', note: 'Not found or not accessible' })
  } else {
    const robotsValidation = validateRobotsTxt(robots.body)
    const aiBlock = robotsValidation.find((r) => r.rule === 'ai-blocklist')
    const llmsRef = robotsValidation.find((r) => r.rule === 'llms-ref')
    const hasAiBlock = aiBlock?.status === 'pass'
    const hasLlmsRef = llmsRef?.status === 'pass'
    results.push({
      file: 'robots.txt',
      url: `${base}/robots.txt`,
      status: 'ok',
      note: `${hasAiBlock ? '✓ AI blocklist' : '⚠ No AI blocklist'} · ${hasLlmsRef ? '✓ llms.txt ref' : '⚠ No llms.txt ref'}`,
    })
  }

  // llms.txt
  const llms = await checkUrl(`${base}/llms.txt`)
  if (!llms.ok) {
    results.push({ file: 'llms.txt', url: `${base}/llms.txt`, status: 'fail', note: 'Not found' })
  } else {
    const llmsValidation = validateLlmsTxt(llms.body)
    const h1 = llmsValidation.find((r) => r.rule === 'h1-title')
    const sections = llmsValidation.find((r) => r.rule === 'sections')
    const hasH1 = h1?.status === 'pass'
    const hasSections = sections?.status === 'pass'
    results.push({
      file: 'llms.txt',
      url: `${base}/llms.txt`,
      status: hasH1 ? 'ok' : 'warn',
      note: `${hasH1 ? '✓ H1 title' : '⚠ Missing H1'} · ${hasSections ? '✓ Sections' : '⚠ No sections'}`,
    })
  }

  // agents.txt
  const agentsTxtRes = await checkUrl(`${base}/agents.txt`)
  if (!agentsTxtRes.ok) {
    results.push({ file: 'agents.txt', url: `${base}/agents.txt`, status: 'warn', note: 'Not found (optional but recommended)' })
  } else {
    const agentsTxtValidation = validateAgentsTxt(agentsTxtRes.body)
    const allPass = agentsTxtValidation.every((r) => r.status !== 'fail')
    const protocols = agentsTxtRes.body.match(/^Protocols:\s*(.+)$/m)?.[1] ?? ''
    results.push({
      file: 'agents.txt',
      url: `${base}/agents.txt`,
      status: allPass ? 'ok' : 'warn',
      note: protocols ? `✓ Payments: ${protocols}` : '⚠ No payment config',
    })
  }

  // agents.json
  const agentsJsonRes = await checkUrl(`${base}/agents.json`)
  if (!agentsJsonRes.ok) {
    results.push({ file: 'agents.json', url: `${base}/agents.json`, status: 'warn', note: 'Not found (strongly recommended)' })
  } else {
    const agentsJsonValidation = validateAgentsJson(agentsJsonRes.body)
    const allPass = agentsJsonValidation.every((r) => r.status !== 'fail')
    const hasPayments = agentsJsonRes.body.includes('"payments"')
    results.push({
      file: 'agents.json',
      url: `${base}/agents.json`,
      status: allPass ? 'ok' : 'warn',
      note: hasPayments ? '✓ Payments block present' : '⚠ No payment config',
    })
  }

  // sitemap.xml
  const sitemap = await checkUrl(`${base}/sitemap.xml`)
  if (!sitemap.ok) {
    results.push({ file: 'sitemap.xml', url: `${base}/sitemap.xml`, status: 'warn', note: 'Not found (recommended)' })
  } else {
    const sitemapValidation = validateSitemapXml(sitemap.body)
    const failed = sitemapValidation.filter((r) => r.status === 'fail')
    const warned = sitemapValidation.filter((r) => r.status === 'warn')
    const urlsRule = sitemapValidation.find((r) => r.rule === 'sitemap-urls')
    const urlCount = urlsRule?.message.match(/Contains (\d+)/)?.[1]
    results.push({
      file: 'sitemap.xml',
      url: `${base}/sitemap.xml`,
      status: failed.length > 0 ? 'fail' : warned.length > 0 ? 'warn' : 'ok',
      note:
        failed.length > 0 ? `❌ ${failed[0]?.message}` :
        warned.length > 0 ? `⚠ ${warned[0]?.message}` :
        urlCount ? `✓ ${urlCount} URLs, sitemaps.org 0.9` : '✓ Valid',
    })
  }

  // Print results
  const icons: Record<string, string> = { ok: '✅', warn: '⚠️ ', fail: '❌' }
  for (const r of results) {
    console.log(`   ${icons[r.status]} ${r.file.padEnd(18)} ${r.note ?? ''}`)
  }

  const score = results.filter((r) => r.status === 'ok').length
  const total = results.length
  console.log(`\n   Score: ${score}/${total} files compliant`)

  if (score < total) {
    console.log(`\n   Run \`herald generate\` to generate missing files.`)
  } else {
    console.log(`\n   🎉 Fully compliant with the Agentic Web Standard!`)
  }
  console.log()
}
