import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateOpenApiJson } from '../openapi.js'
import type { AgenticConfig } from '../types.js'

const base: AgenticConfig = {
  site: { name: 'Example', url: 'https://example.com', description: 'An example.' },
}

let warnSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('generateOpenApiJson', () => {
  it('returns null when payments.openapi is absent', () => {
    expect(generateOpenApiJson(base)).toBeNull()
  })

  it('returns null when payments.openapi.paths is an empty object', () => {
    expect(generateOpenApiJson({ ...base, payments: { openapi: { paths: {} } } })).toBeNull()
  })

  it('emits openapi 3.1.0 with title, version, and servers derived from site', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': { offers: [{ intent: 'charge', method: 'x402', amount: '10000', currency: 'USDC' }] } } } },
    })!
    const doc = JSON.parse(out)
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info.title).toBe('Example — payable API')
    expect(doc.info.version).toBe('1.0.0')
    expect(doc.servers).toEqual([{ url: 'https://example.com' }])
  })

  it('strips a trailing slash from server.url', () => {
    const out = generateOpenApiJson({
      site: { name: 'X', url: 'https://example.com/' },
      payments: { openapi: { paths: { '/p': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } } } },
    } as AgenticConfig)!
    expect(JSON.parse(out).servers[0].url).toBe('https://example.com')
  })

  it('honours explicit title and version overrides', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: {
        title: 'Custom Title',
        version: '7.7.7',
        paths: { '/p': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } },
      } },
    })!
    const doc = JSON.parse(out)
    expect(doc.info.title).toBe('Custom Title')
    expect(doc.info.version).toBe('7.7.7')
  })

  it('forwards site.description into info.description', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/p': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } } } },
    })!
    // info.description carries site.description followed by the API
    // versioning policy block herald appends to every generated document.
    const desc = JSON.parse(out).info.description as string
    expect(desc).toContain('An example.')
    expect(desc).toContain('API versioning')
  })

  it('uses the single-offer shorthand when exactly one offer is declared', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': { offers: [{ intent: 'charge', method: 'x402', amount: '10000' }] } } } },
    })!
    const xpi = JSON.parse(out).paths['/buy'].get['x-payment-info']
    expect(xpi).toEqual({ intent: 'charge', method: 'x402', amount: '10000' })
    expect(xpi.offers).toBeUndefined()
  })

  it('uses the offers[] array form when more than one offer is declared', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': { offers: [
        { intent: 'charge', method: 'x402',  amount: '10000' },
        { intent: 'charge', method: 'stripe', amount: '10' },
      ] } } } },
    })!
    const xpi = JSON.parse(out).paths['/buy'].get['x-payment-info']
    expect(xpi.offers).toHaveLength(2)
  })

  it('emits 200 + 402 responses for every payable path', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } } } },
    })!
    const responses = JSON.parse(out).paths['/buy'].get.responses
    expect(responses).toHaveProperty('200')
    expect(responses).toHaveProperty('402')
  })

  it('attaches the full RFC 9598 RateLimit header set to 200 responses', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } } } },
    })!
    const headers = JSON.parse(out).paths['/buy'].get.responses['200'].headers
    expect(Object.keys(headers).sort()).toEqual([
      'RateLimit-Limit',
      'RateLimit-Policy',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ])
  })

  it('references the shared error / rate-limit responses on every payable path', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } } } },
    })!
    const responses = JSON.parse(out).paths['/buy'].get.responses
    expect(responses['400']).toEqual({ $ref: '#/components/responses/Problem400' })
    expect(responses['429']).toEqual({ $ref: '#/components/responses/RateLimited' })
    expect(responses['5XX']).toEqual({ $ref: '#/components/responses/Problem5xx' })
  })

  it('emits the Idempotency-Key parameter ref on every payable operation', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } } } },
    })!
    const params = JSON.parse(out).paths['/buy'].get.parameters
    expect(params).toContainEqual({ $ref: '#/components/parameters/IdempotencyKey' })
  })

  it('publishes a typed error model + pagination shape + headers + parameters under components', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } } } },
    })!
    const components = JSON.parse(out).components
    expect(components.schemas).toHaveProperty('Problem')
    expect(components.schemas).toHaveProperty('PaginatedList')
    expect(components.parameters).toHaveProperty('IdempotencyKey')
    expect(components.parameters).toHaveProperty('Cursor')
    expect(components.parameters).toHaveProperty('Limit')
    expect(components.headers).toHaveProperty('RateLimit-Limit')
    expect(components.responses).toHaveProperty('RateLimited')
  })

  it('forwards summary and description from the path entry to the operation', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/buy': {
        summary: 'Buy a thing',
        description: 'Costs 0.01 USDC',
        offers: [{ intent: 'charge', method: 'x402', amount: '10000' }],
      } } } },
    })!
    const op = JSON.parse(out).paths['/buy'].get
    expect(op.summary).toBe('Buy a thing')
    expect(op.description).toBe('Costs 0.01 USDC')
  })

  it('skips paths with no offers and warns', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: {
        '/empty': { offers: [] },
        '/buy':   { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] },
      } } },
    })!
    const doc = JSON.parse(out)
    expect(Object.keys(doc.paths)).toEqual(['/buy'])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns null when every declared path is empty after filtering', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/empty': { offers: [] } } } },
    })
    expect(out).toBeNull()
  })

  it('always ends with a single trailing newline', () => {
    const out = generateOpenApiJson({
      ...base,
      payments: { openapi: { paths: { '/p': { offers: [{ intent: 'charge', method: 'x402', amount: '1' }] } } } },
    })!
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})
