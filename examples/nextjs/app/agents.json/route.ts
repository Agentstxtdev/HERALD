import { generateAgentsJson } from '@herald/core'
import config from '../../agentsjson.config.js'

export function GET() {
  return new Response(generateAgentsJson(config), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
