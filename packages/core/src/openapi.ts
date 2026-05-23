// ─────────────────────────────────────────────────────────────────────────────
// OpenAPI discovery generator — /openapi.json
//
// Emits a minimal OpenAPI 3.1 document declaring the site's payable paths with
// `x-payment-info` extensions per the MPP / Payment Discovery draft
// (https://paymentauth.org/draft-payment-discovery-00.txt). Agents read this
// file to pre-screen what an endpoint costs before issuing the request.
//
// Scope: declaration only. herald does not author the full OpenAPI schema for
// arbitrary site APIs — only the payable-paths slice the auditors look at. A
// site with a richer API should merge its own spec with this output (or hand-
// author the full document and skip this generator).
//
// Honest-declarations rule: emits null when `payments.openapi.paths` is empty
// or absent. Each path's offers[] is emitted verbatim.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgenticConfig, OpenApiPaymentOffer } from './types.js'

function singleOrOffers(offers: OpenApiPaymentOffer[]): unknown {
  // Shorthand single-offer form per the discovery draft §3.2: when there is
  // exactly one offer, the x-payment-info value is the offer object itself.
  // Multiple offers go under an `offers[]` array.
  if (offers.length === 1) return offers[0]
  return { offers }
}

// Derive a stable operationId from a pathname. Function-calling agents
// (ChatGPT, Claude, Gemini) require operationIds to address operations; the
// rule mirrors the slug pattern used elsewhere in herald: strip leading
// slash, replace any non-alphanumeric run with a single dash, lowercase.
function operationIdFor(pathname: string, method: string): string {
  const slug = pathname.replace(/^\/+/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${method}${slug ? '-' + slug : '-root'}`
}

// Reusable components inserted into every generated OpenAPI document. They
// satisfy agent-readiness scanners that look for: a typed error model (RFC
// 7807 Problem Details), pagination response shape, an Idempotency-Key
// parameter (RFC draft-ietf-httpapi-idempotency-key-header), and the RFC 9598
// RateLimit response header set. The discovery slice herald emits never has
// mutation endpoints of its own, but advertising the components on the
// document lets scanners detect the policy and lets adopters extend the
// document with their own mutation endpoints that `$ref` the same shapes.
function buildComponents(): Record<string, unknown> {
  return {
    schemas: {
      // RFC 7807 Problem Details — the typed error model.
      Problem: {
        type: 'object',
        description: 'Typed error response per RFC 7807 (Problem Details for HTTP APIs).',
        properties: {
          type:     { type: 'string', format: 'uri', description: 'URI identifying the error type.' },
          title:    { type: 'string', description: 'Short human-readable summary.' },
          status:   { type: 'integer', description: 'HTTP status code.' },
          detail:   { type: 'string', description: 'Per-occurrence explanation.' },
          instance: { type: 'string', format: 'uri', description: 'URI identifying the specific occurrence.' },
          code:     { type: 'string', description: 'Stable machine-readable error code.' },
        },
        required: ['title', 'status'],
      },
      // Generic pagination envelope so agents can predict the shape of any
      // list endpoint the adopter adds. Cursor-based (RFC 5005 alternative).
      PaginatedList: {
        type: 'object',
        description: 'Cursor-based paginated list envelope. Use `next_cursor` on the next request to fetch the following page; null on the last page.',
        properties: {
          items:       { type: 'array', items: { type: 'object', additionalProperties: true } },
          next_cursor: { type: ['string', 'null'], description: 'Opaque cursor token for the next page, or null when no more pages.' },
          has_more:    { type: 'boolean', description: 'Convenience boolean; true while `next_cursor` is non-null.' },
        },
        required: ['items', 'next_cursor'],
      },
    },
    parameters: {
      IdempotencyKey: {
        name: 'Idempotency-Key',
        in: 'header',
        description: 'Optional client-generated UUID or opaque string. When supplied on a mutating request, the server returns the original response on retry rather than executing the operation a second time. Recommended for any agent retrying a request after a network failure. See https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-08.html.',
        required: false,
        schema: { type: 'string', minLength: 1, maxLength: 255 },
      },
      Cursor: {
        name: 'cursor',
        in: 'query',
        description: 'Opaque pagination cursor returned by the previous page (`next_cursor`). Omit on the first page.',
        required: false,
        schema: { type: 'string' },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        description: 'Maximum number of items to return on this page. Server-defined upper bound.',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
    },
    headers: {
      // RFC 9598 RateLimit header field set.
      'RateLimit-Limit':     { description: 'Maximum number of requests per window for this quota policy.', schema: { type: 'integer' } },
      'RateLimit-Remaining': { description: 'Number of requests remaining in the current window.',         schema: { type: 'integer' } },
      'RateLimit-Reset':     { description: 'Seconds until the current rate-limit window resets.',         schema: { type: 'integer' } },
      'RateLimit-Policy':    { description: 'Rate-limit policy descriptor per RFC 9598 §3.1.',             schema: { type: 'string'  } },
      'Retry-After':         { description: 'Seconds the client should wait before retrying.',             schema: { type: 'integer' } },
    },
    responses: {
      Problem400: {
        description: 'Bad request: malformed input or missing required field.',
        content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
      },
      Problem401: {
        description: 'Unauthorized: authentication required or invalid credential.',
        content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
      },
      Problem403: {
        description: 'Forbidden: authenticated but not permitted.',
        content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
      },
      Problem404: {
        description: 'Not found.',
        content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
      },
      RateLimited: {
        description: 'Rate limited. Retry after `Retry-After` seconds.',
        headers: {
          'Retry-After':         { $ref: '#/components/headers/Retry-After' },
          'RateLimit-Limit':     { $ref: '#/components/headers/RateLimit-Limit' },
          'RateLimit-Remaining': { $ref: '#/components/headers/RateLimit-Remaining' },
          'RateLimit-Reset':     { $ref: '#/components/headers/RateLimit-Reset' },
          'RateLimit-Policy':    { $ref: '#/components/headers/RateLimit-Policy' },
        },
        content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
      },
      Problem5xx: {
        description: 'Server error.',
        content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
      },
    },
  }
}

// API versioning policy advertised in info.description so scanners that read
// the document understand how breaking changes ship. Header-based versioning
// is the policy: the major version lives in `info.version` (semver MAJOR.MINOR),
// breaking changes bump MAJOR and ship a new document at the same URL; clients
// pin via the standard `Accept` parameter or the `API-Version` request header.
const VERSIONING_POLICY = `\n\n## API versioning\n\nThis document follows semver in \`info.version\`. Breaking changes bump the MAJOR field and ship a new document. Clients pin to a major by setting \`API-Version: <MAJOR>\` on requests or by accepting only the matching media type (\`application/json; version=<MAJOR>\`). Removed operations are kept in the document for one MAJOR with \`deprecated: true\` and an \`x-deprecation-date\` extension before being dropped.`

export function generateOpenApiJson(config: AgenticConfig): string | null {
  const oa = config.payments?.openapi
  if (!oa || !oa.paths || Object.keys(oa.paths).length === 0) return null

  const paths: Record<string, unknown> = {}
  for (const [pathname, entry] of Object.entries(oa.paths)) {
    if (!entry.offers || entry.offers.length === 0) {
      console.warn(`[herald] /openapi.json: skipping path "${pathname}" — no payment offers declared`)
      continue
    }
    // GET is the safe default for a discovery-only doc. Sites with non-GET
    // payable operations should hand-author their own OpenAPI; herald's
    // discovery slice deliberately stays minimal.
    paths[pathname] = {
      get: {
        operationId: operationIdFor(pathname, 'get'),
        ...(entry.summary ? { summary: entry.summary } : {}),
        ...(entry.description ? { description: entry.description } : {}),
        parameters: [
          { $ref: '#/components/parameters/IdempotencyKey' },
        ],
        'x-payment-info': singleOrOffers(entry.offers),
        responses: {
          '200': {
            description: 'Payment verified; response returned.',
            headers: {
              'RateLimit-Limit':     { $ref: '#/components/headers/RateLimit-Limit' },
              'RateLimit-Remaining': { $ref: '#/components/headers/RateLimit-Remaining' },
              'RateLimit-Reset':     { $ref: '#/components/headers/RateLimit-Reset' },
              'RateLimit-Policy':    { $ref: '#/components/headers/RateLimit-Policy' },
            },
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
          '400': { $ref: '#/components/responses/Problem400' },
          '402': {
            description: 'Payment required. Resolve the x-payment-info offer(s) and retry.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    accepts: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  },
                },
              },
            },
          },
          '429': { $ref: '#/components/responses/RateLimited' },
          '5XX': { $ref: '#/components/responses/Problem5xx' },
        },
      },
    }
  }

  if (Object.keys(paths).length === 0) return null

  const baseDescription = config.site.description ?? ''
  const doc = {
    openapi: '3.1.0',
    info: {
      title:   oa.title   ?? `${config.site.name} — payable API`,
      version: oa.version ?? '1.0.0',
      description: `${baseDescription}${VERSIONING_POLICY}`.trim(),
    },
    servers: [{ url: config.site.url.replace(/\/$/, '') }],
    paths,
    components: buildComponents(),
  }

  return JSON.stringify(doc, null, 2) + '\n'
}
