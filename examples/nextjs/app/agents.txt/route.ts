import { generateAgentsTxt } from '@agentstxtdev/herald-core'
import config from '../../agentsjson.config.js'

const SPEC_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600',
}

export function GET() {
  return new Response(generateAgentsTxt(config), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SPEC_HEADERS },
  })
}
