import { llmsTxtHandler } from '@herald/addon/nextjs'
import config from '../../agentsjson.config.js'

export const GET = llmsTxtHandler(config)
