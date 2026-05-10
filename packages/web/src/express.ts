/**
 * Express adapter for @agentify/web
 *
 * Usage:
 *   import { createAgenticRouter, agenticPaymentMiddleware } from '@agentify/web/express'
 *
 *   app.use(createAgenticRouter(config))
 *   app.use('/api', agenticPaymentMiddleware(config, '/api'))
 *
 * Peer dependencies:
 *   express  — npm install express
 *   mppx     — npm install mppx     (for MPP — Tempo + Stripe)
 *   stripe   — npm install stripe   (for Stripe via MPP)
 */
import { Router } from 'express'
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
  Router as ExpressRouter,
} from 'express'
import {
  generateRobotsTxt,
  generateLlmsTxt,
  generateAgentsTxt,
  generateAgentsJson,
  type AgenticConfig,
} from '@agentify/core'
import { gateRequest } from './payment-gate.js'

// ─────────────────────────────────────────────────────────────────────────────
// Discovery file router — robots.txt, llms.txt, agents.txt, agents.json
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 3600 * 1000

export function createAgenticRouter(config: AgenticConfig): ExpressRouter {
  const router: ExpressRouter = Router()

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

  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain').header('Cache-Control', 'public, max-age=3600').send(robotsTxt)
  })
  router.get('/llms.txt', (_req, res, next) => {
    getLlmsTxt()
      .then((c) => res.type('text/plain').header('Cache-Control', 'public, max-age=3600').send(c))
      .catch(next)
  })
  router.get('/agents.txt', (_req, res) => {
    res.type('text/plain').header('Cache-Control', 'public, max-age=3600').send(agentsTxt)
  })
  router.get('/agents.json', (_req, res) => {
    res.type('application/json').header('Cache-Control', 'public, max-age=3600').send(agentsJson)
  })

  return router
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment middleware — fetch-style gate adapted for Express
// ─────────────────────────────────────────────────────────────────────────────

export function agenticPaymentMiddleware(config: AgenticConfig, pathPrefix = '') {
  if (!config.payments?.enabled) {
    return (_req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => next()
  }

  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
    try {
      const request = expressToFetchRequest(req)
      const result = await gateRequest(request, { config, pathPrefix })

      if (result.kind === 'pass') {
        next()
        return
      }
      if (result.kind === 'pass-with-headers') {
        for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v)
        next()
        return
      }
      // 'respond'
      const r = result.response
      res.status(r.status)
      r.headers.forEach((v, k) => res.setHeader(k, v))
      const body = await r.text()
      res.send(body)
    } catch (err) {
      next(err)
    }
  }
}

function expressToFetchRequest(req: ExpressRequest): Request {
  const xfProto = req.headers['x-forwarded-proto']
  const proto =
    (typeof xfProto === 'string' ? xfProto : Array.isArray(xfProto) ? xfProto[0] : undefined) ??
    req.protocol ??
    'http'
  const host = req.headers.host ?? 'localhost'
  const url = `${proto}://${host}${req.originalUrl}`
  const headers = new Headers()
  for (const k of Object.keys(req.headers)) {
    const v = req.headers[k]
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) headers.set(k, v.join(', '))
  }
  const init: RequestInit = { method: req.method, headers }
  if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }
  return new Request(url, init)
}
