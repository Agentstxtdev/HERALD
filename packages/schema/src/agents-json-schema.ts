// ─────────────────────────────────────────────────────────────────────────────
// agents.json wire-format Zod schema.
//
// Mirrors what `@agentstxtdev/herald-core` actually emits via
// `generateAgentsJson(config)`, NOT the input `AgenticConfig` shape (that's a
// different Zod schema in `@agentstxtdev/herald` / packages/cli/config-schema).
//
// Single source of truth for:
//   - Runtime validation of a served `agents.json` (third-party validators)
//   - TypeScript types via `z.infer<typeof AgentsJsonSchema>`
//   - The public JSON Schema hosted at agents-txt.com/schema/agents-json/v1.0.json,
//     derived with `z.toJSONSchema(AgentsJsonSchema)` and committed as a static
//     asset on the reference deployment.
//
// Standard: https://agents-txt.com (agents.txt spec v1.0)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'

// ── Shared building blocks ──────────────────────────────────────────────────

const HttpsUrl = z
  .string()
  .regex(/^https?:\/\//, 'must be a valid http(s) URL')
  .describe('Absolute HTTP(S) URL.')

const PaymentProtocolKey = z
  .string()
  .regex(/^(x402|mpp|ap2|x-.+)$/, 'must be x402, mpp, ap2, or an x- experimental identifier')

const AuthProtocolKey = z
  .string()
  .regex(/^(agent-auth|oauth2|x-.+)$/, 'must be agent-auth, oauth2, or an x- experimental identifier')

// ── Per-protocol blocks ─────────────────────────────────────────────────────

const X402Block = z
  .object({
    chains: z
      .array(z.string().regex(/^(eip155|solana):/, 'CAIP-2 chain identifier'))
      .min(1)
      .describe('CAIP-2 chain identifiers the site can settle on.'),
    description: z.string().optional(),
  })
  .describe('x402 v2 micropayments block. See https://x402.org.')

const MppBlock = z
  .object({
    methods: z
      .array(z.enum(['tempo', 'stripe']))
      .min(1)
      .describe('Wire-active MPP methods. Gated on credentials at emit time.'),
    description: z.string().optional(),
  })
  .describe('MPP session-based payments. See https://mpp.dev.')

const Ap2Block = z
  .object({
    presentations: z.array(z.string()).optional().describe('Accepted VC presentation formats (e.g. sd-jwt-vc).'),
    spec: HttpsUrl.optional().describe('URL of the AP2 spec revision the site implements.'),
    description: z.string().optional(),
  })
  .describe('AP2 mandate-trust layer. Composes with x402 / MPP. See https://ap2-protocol.org.')

const PricingBlock = z
  .object({
    amount: z.union([z.string(), z.number()]).describe('Advertised default price (atomic / decimal per protocol).'),
    currency: z.string().optional().describe('ISO 4217 code or on-chain token symbol.'),
  })
  .describe('Pre-screen pricing. Wallet addresses live in 402 responses, never here.')

// ── Top-level capability blocks ─────────────────────────────────────────────

const PaymentsBlock = z
  .object({
    x402: X402Block.optional(),
    mpp: MppBlock.optional(),
    ap2: Ap2Block.optional(),
    required: z.literal(true).optional().describe('Site-level policy: every interaction requires payment.'),
    pricing: PricingBlock.optional(),
  })
  .catchall(z.object({}).passthrough())
  .superRefine((val, ctx) => {
    const keys = Object.keys(val)
    const protocolKeys = keys.filter((k) => k === 'x402' || k === 'mpp' || k === 'ap2' || /^x-.+/.test(k))
    if (protocolKeys.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'payments block must include at least one per-protocol key (x402, mpp, ap2, or x-…)',
      })
    }
    for (const k of keys) {
      if (k === 'required' || k === 'pricing' || k === 'x402' || k === 'mpp' || k === 'ap2') continue
      if (!/^x-.+/.test(k)) {
        ctx.addIssue({
          code: 'custom',
          path: [k],
          message: `unknown payments key "${k}" — registered keys are x402, mpp, ap2; experimental identifiers must use the x- prefix`,
        })
      }
    }
  })

const AuthorizationBlock = z.object({
  protocols: z.array(AuthProtocolKey).min(1).describe('Accepted authorization protocol identifiers.'),
  discovery: z
    .string()
    .startsWith('/')
    .describe('Discovery endpoint, typically /.well-known/agent-configuration.'),
  identity: z
    .literal('required')
    .optional()
    .describe('Site-level policy: every authenticated agent must carry a verifiable identity.'),
})

const McpEntry = z.object({
  url: HttpsUrl,
  type: z.literal('streamable-http').describe('MCP HTTP transport — only "streamable-http" is registered.'),
  version: z.string().optional().describe('MCP transport revision pin.'),
  description: z.string().optional(),
})

const SkillEntry = z.object({
  url: HttpsUrl.describe('URL of the SKILL.md or skill bundle.'),
  description: z.string().optional(),
})

const A2AEntry = z.object({
  url: HttpsUrl.describe('URL of an AgentCard per the A2A spec §9.'),
  description: z.string().optional(),
})

const UcpEntry = z.object({
  url: HttpsUrl.describe('URL of a UCP profile JSON.'),
  description: z.string().optional(),
})

// ── Top-level document ──────────────────────────────────────────────────────

export const AgentsJsonSchema = z
  .object({
    $schema: HttpsUrl.optional().describe('URL of the JSON Schema describing this document. Optional but recommended.'),
    version: z
      .string()
      .regex(/^\d+\.\d+$/)
      .describe('agents.json schema version (e.g. "1.0"). MUST be a numeric major.minor pair.'),
    standard: HttpsUrl.describe('URL of the agents.txt standard this file conforms to.'),
    site: z
      .object({
        name: z.string().min(1),
        url: HttpsUrl,
        description: z.string().optional(),
      })
      .describe('Site identity.'),
    payments: PaymentsBlock.optional(),
    authorization: AuthorizationBlock.optional(),
    mcp: z.array(McpEntry).optional(),
    skills: z.array(SkillEntry).optional(),
    a2a: z.array(A2AEntry).optional(),
    ucp: z.array(UcpEntry).optional(),
  })
  .describe(
    'agents.json — structured companion to agents.txt. Declares the capabilities a site exposes to AI agents (payments, authorization, MCP servers, skill packages, A2A AgentCards, UCP profiles). See https://agents-txt.com for the full specification.',
  )

export type AgentsJson = z.infer<typeof AgentsJsonSchema>

/** Schema metadata. Bump SCHEMA_VERSION when the wire format changes. */
export const SCHEMA_VERSION = '1.0' as const
export const SCHEMA_ID = `https://agents-txt.com/schema/agents-json/v${SCHEMA_VERSION}.json` as const
