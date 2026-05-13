#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { emitCommand } from './commands/emit.js'

const program = new Command()

program
  .name('herald')
  .description(
    'The agent-capabilities discovery layer for the agentic web.\n' +
    'Emits robots.txt, llms.txt, agents.txt, and agents.json so your site declares\n' +
    'what AI agents can do with it.',
  )
  .version('0.1.0')

program
  .command('init')
  .description('Interactive setup: creates agentsjson.config.js')
  .option('--name <name>', 'Site name')
  .option('--url <url>', 'Site URL')
  .option('--sitemap <url>', 'Sitemap URL')
  .option('--wallet <address>', 'Treasury wallet address for x402 payments')
  .option('--firecrawl-key <key>', 'Firecrawl API key for content crawling')
  .option('-y, --yes', 'Skip prompts, use defaults')
  .action(initCommand)

program
  .command('emit')
  .description(
    'Emit robots.txt, llms.txt, agents.txt, and agents.json from agentsjson.config.js.\n' +
    'Outputs to --out directory (default: ./public).\n' +
    '\n' +
    'By default every applicable file is emitted. Pass one or more positive flags\n' +
    '(--robots, --llms, --llms-full, --agents, --sitemap) to emit only those files.\n' +
    'Negative flags (--skip-*) subtract from whatever set is selected.',
  )
  .option('-c, --config <path>', 'Path to config file', './agentsjson.config.js')
  .option('-o, --out <dir>', 'Output directory', './public')
  // Positive selectors: pass one or more to emit only those files.
  .option('--robots', 'Emit only robots.txt (combine with other positive flags to widen the set)')
  .option('--llms', 'Emit only llms.txt')
  .option('--llms-full', 'Emit only llms-full.txt (requires content.fullTxt in config)')
  .option('--agents', 'Emit only agents.txt and agents.json')
  .option('--sitemap', 'Emit only sitemap.xml (also forces emission for the firecrawl driver)')
  .option('--headers', 'Emit only the §4.5 headers config for the detected hosting platform (`_headers` for Cloudflare/Netlify, `vercel.json` for Vercel, fallback `_headers` otherwise)')
  .option('--security', 'Emit only .well-known/security.txt (RFC 9116; requires a `security.contact` in config)')
  .option('--discovery', 'Emit only the discovery surfaces: .well-known/api-catalog (RFC 9727), .well-known/mcp/server-card.json (SEP-2127), .well-known/agent-skills/index.json (agentskills.io v0.2.0). Each file is gated by its own config block.')
  // Negative selectors: subtract from the selected set. Useful with the default
  // "emit everything" mode, or to drop one file from a positive selection.
  .option('--skip-robots', 'Skip robots.txt')
  .option('--skip-llms', 'Skip llms.txt')
  .option('--skip-llms-full', 'Skip llms-full.txt (keep llms.txt; useful when fullTxt is configured but you only want to refresh the index)')
  .option('--skip-agents', 'Skip agents.txt and agents.json')
  .option('--skip-sitemap', 'Skip sitemap.xml')
  .option('--skip-headers', 'Skip the §4.5 headers config file')
  .option('--skip-security', 'Skip .well-known/security.txt')
  .option('--skip-discovery', 'Skip the .well-known/ discovery surfaces (api-catalog, mcp/server-card.json, agent-skills/index.json)')
  .option('--platform <name>', 'Override the detected hosting platform for `--headers` (cloudflare|netlify|vercel|unknown)')
  .action(emitCommand)

program
  .command('check <url>')
  .description('Check if a site is herald compliant')
  .action(async (url: string) => {
    const { checkCompliance } = await import('./commands/check.js')
    await checkCompliance(url)
  })

program.parse()
