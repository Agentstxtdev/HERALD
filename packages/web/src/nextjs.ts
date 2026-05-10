/**
 * Next.js adapter for @agentify/web
 *
 * Two usage patterns:
 *
 * 1. middleware.ts — Edge Middleware payment proxy:
 *      import config from './agentic.config.js'
 *      import { createPaymentProxy } from '@agentify/web/nextjs'
 *      export default createPaymentProxy(config, '/api')
 *      export const config = { matcher: ['/api/:path*'] }
 *
 * 2. App Router route handlers — discovery files:
 *      export const GET = robotsTxtHandler(config)
 *      export const GET = llmsTxtHandler(config)
 *      export const GET = agentsTxtHandler(config)
 *      export const GET = agentsJsonHandler(config)
 *
 * Peer dependencies:
 *   next    — npm install next
 *   mppx    — npm install mppx    (for MPP)
 *   stripe  — npm install stripe  (for Stripe via MPP)
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  generateRobotsTxt,
  generateLlmsTxt,
  generateAgentsTxt,
  generateAgentsJson,
  type AgenticConfig,
} from '@agentify/core'
import { gateRequest } from './payment-gate.js'

// ─────────────────────────────────────────────────────────────────────────────
// Discovery file route handlers
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 3600 * 1000

export function robotsTxtHandler(config: AgenticConfig) {
  const body = generateRobotsTxt(config)
  return function GET(): NextResponse {
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }
}

export function llmsTxtHandler(config: AgenticConfig) {
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
  return async function GET(): Promise<NextResponse> {
    const content = await getLlmsTxt()
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }
}

export function agentsTxtHandler(config: AgenticConfig) {
  const body = generateAgentsTxt(config)
  return function GET(): NextResponse {
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }
}

export function agentsJsonHandler(config: AgenticConfig) {
  const body = generateAgentsJson(config)
  return function GET(): NextResponse {
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createPaymentProxy — middleware.ts
// ─────────────────────────────────────────────────────────────────────────────

export function createPaymentProxy(config: AgenticConfig, pathPrefix = '') {
  if (!config.payments?.enabled) {
    return (_req: NextRequest): NextResponse => NextResponse.next()
  }

  return async (req: NextRequest): Promise<Response> => {
    const result = await gateRequest(req as unknown as Request, { config, pathPrefix })
    if (result.kind === 'pass') return NextResponse.next()
    if (result.kind === 'pass-with-headers') {
      const headers = new Headers()
      for (const [k, v] of Object.entries(result.headers)) headers.set(k, v)
      return NextResponse.next({ headers })
    }
    return result.response
  }
}
