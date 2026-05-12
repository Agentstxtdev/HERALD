/**
 * Hono adapter for @herald/addon
 *
 * Usage:
 *   import { Hono } from 'hono'
 *   import { createAgenticRoutes, agenticPaymentMiddleware } from '@herald/addon/hono'
 *
 *   const app = new Hono()
 *   createAgenticRoutes(app, config)
 *   app.use('/api/*', agenticPaymentMiddleware(config, '/api'))
 *
 * Peer dependencies:
 *   hono    — npm install hono
 *   mppx    — npm install mppx    (for MPP)
 *   stripe  — npm install stripe  (for Stripe via MPP)
 */
import type { Context, MiddlewareHandler, Next } from 'hono'
import {
  generateRobotsTxt,
  generateLlmsTxt,
  generateAgentsTxt,
  generateAgentsJson,
  resolveActiveProtocols,
  type AgenticConfig,
} from '@herald/core'
import { gateRequest } from './payment-gate.js'

const CACHE_TTL_MS = 3600 * 1000

interface HonoApp {
  get(path: string, handler: (c: Context) => Promise<Response> | Response): void
}

export function createAgenticRoutes(app: HonoApp, config: AgenticConfig): void {
  const robotsTxt = generateRobotsTxt(config)
  const agentsTxt = generateAgentsTxt(config)
  const agentsJson = generateAgentsJson(config)

  let llmsPromise: Promise<string> | null = null
  let llmsExpiry = 0
  function getLlmsTxt(): Promise<string> {
    const now = Date.now()
    if (!llmsPromise || now > llmsExpiry) {
      llmsPromise = (generateLlmsTxt(config) as Promise<string>).catch((err: unknown): never => {
        llmsPromise = null
        throw err
      })
      llmsExpiry = now + CACHE_TTL_MS
    }
    return llmsPromise!
  }

  app.get('/robots.txt', (c) =>
    c.text(robotsTxt, 200, { 'Cache-Control': 'public, max-age=3600' }),
  )
  app.get('/llms.txt', async (c) => {
    const content = await getLlmsTxt()
    return c.text(content, 200, { 'Cache-Control': 'public, max-age=3600' })
  })
  app.get('/agents.txt', (c) =>
    c.text(agentsTxt, 200, { 'Cache-Control': 'public, max-age=3600' }),
  )
  app.get('/agents.json', (c) =>
    c.json(JSON.parse(agentsJson), 200, { 'Cache-Control': 'public, max-age=3600' }),
  )
}

export function agenticPaymentMiddleware(
  config: AgenticConfig,
  pathPrefix = '',
): MiddlewareHandler {
  if (!config.payments || resolveActiveProtocols(config.payments).length === 0) {
    return async (_c: Context, next: Next) => next()
  }

  return async (c: Context, next: Next) => {
    const result = await gateRequest(c.req.raw, { config, pathPrefix })
    if (result.kind === 'pass') return next()
    if (result.kind === 'pass-with-headers') {
      await next()
      for (const [k, v] of Object.entries(result.headers)) c.header(k, v)
      return
    }
    return result.response
  }
}
