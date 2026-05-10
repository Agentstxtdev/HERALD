import { agentsJsonHandler } from '@agentify/web/nextjs'
import config from '../../agentic.config.js'

export const GET = agentsJsonHandler(config)
