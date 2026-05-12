import { agentsJsonHandler } from '@herald/addon/nextjs'
import config from '../../agentic.config.js'

export const GET = agentsJsonHandler(config)
