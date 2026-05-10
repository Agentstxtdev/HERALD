#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { generateCommand } from './commands/generate.js'

const program = new Command()

program
  .name('agentify')
  .description(
    'Make any website LLM-ready and monetizable by AI agents.\n' +
    'Generates robots.txt, llms.txt, agents.txt, and agents.json following the Agentic Web Standard.',
  )
  .version('0.1.0')

program
  .command('init')
  .description('Interactive setup: creates agentic.config.js')
  .option('--name <name>', 'Site name')
  .option('--url <url>', 'Site URL')
  .option('--sitemap <url>', 'Sitemap URL')
  .option('--wallet <address>', 'Treasury wallet address for x402 payments')
  .option('--firecrawl-key <key>', 'Firecrawl API key for content crawling')
  .option('-y, --yes', 'Skip prompts, use defaults')
  .action(initCommand)

program
  .command('generate')
  .description(
    'Generate robots.txt, llms.txt, agents.txt, and agents.json from agentic.config.js.\n' +
    'Outputs to --out directory (default: ./public).',
  )
  .option('-c, --config <path>', 'Path to config file', './agentic.config.js')
  .option('-o, --out <dir>', 'Output directory', './public')
  .option('--skip-robots', 'Skip robots.txt generation')
  .option('--skip-llms', 'Skip llms.txt generation (useful if using Firecrawl separately)')
  .option('--skip-agents', 'Skip agents.txt and agents.json generation (emit only robots.txt + llms.txt)')
  .option('--sitemap', 'Force sitemap.xml emission (also for firecrawl driver — usually a curated subset)')
  .option('--skip-sitemap', 'Never emit sitemap.xml (overrides default for static/manual drivers)')
  .action(generateCommand)

program
  .command('check <url>')
  .description('Check if a site is agentify compliant')
  .action(async (url: string) => {
    const { checkCompliance } = await import('./commands/check.js')
    await checkCompliance(url)
  })

program.parse()
