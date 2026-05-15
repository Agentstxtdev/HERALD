import { z } from 'zod'
import { PAYMENT_PROTOCOLS, AUTH_PROTOCOLS } from '@agentstxtdev/herald-core'

// Registered identifiers plus an `x-` prefix escape hatch per spec §3.1.
// Adding a registered protocol is one edit in @herald/core/protocols.ts;
// experimental protocols flow through automatically via the `x-` regex.
const ProtocolIdentifierSchema = (registered: readonly string[]) =>
  z.string().refine(
    (v) => registered.includes(v) || /^x-.+/.test(v),
    {
      error: `expected one of: ${registered.join(', ')} (or an x- prefixed experimental identifier)`,
    },
  )

// ─────────────────────────────────────────────────────────────────────────────
// Zod v4 schema for AgenticConfig — validates user-supplied config at load time.
//
// Lives in the CLI (not @herald/core) to preserve core's zero-runtime-dep
// guarantee. This is the only place user config crosses a trust boundary:
// `emit.ts` → loadConfig() → AgenticConfigSchema.safeParse().
//
// v4 API notes used here:
//   z.url()     — top-level URL format (replaces deprecated z.string().url())
//   { error: }  — replaces { message: } in .refine() options
// ─────────────────────────────────────────────────────────────────────────────

const PageEntrySchema = z.object({
  title: z.string().min(1, 'title must not be empty'),
  url: z.url('url must be a valid URL'),
  description: z.string().optional(),
})

const ContentSectionSchema = z.object({
  name: z.string().min(1, 'section name must not be empty'),
  pages: z.array(PageEntrySchema),
  optional: z.boolean().optional(),
})

const LlmsDriverSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sitemap'),
    sitemapUrl: z.url('sitemapUrl must be a valid URL'),
  }),
  z.object({
    type: z.literal('firecrawl'),
    siteUrl: z.url('siteUrl must be a valid URL'),
    apiKey: z.string().min(1, 'apiKey must not be empty'),
    limit: z.number().int().positive().max(100_000, 'limit cannot exceed 100000 (Firecrawl v2 max)').optional(),
    search: z.string().optional(),
    sitemap: z.enum(['include', 'skip', 'only']).optional(),
    includeSubdomains: z.boolean().optional(),
    ignoreQueryParameters: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('static'),
    pages: z.array(PageEntrySchema),
    sections: z.array(ContentSectionSchema).optional(),
  }),
  z.object({
    type: z.literal('manual'),
    sections: z.array(ContentSectionSchema).min(1, 'manual driver requires at least one section'),
  }),
])

const ContentConfigSchema = z.object({
  driver: LlmsDriverSchema,
  fullTxt: z.object({ driver: LlmsDriverSchema }).optional(),
})

const CrawlerRuleSchema = z.object({
  userAgent: z.string().min(1),
  allow: z.array(z.string()).optional(),
  disallow: z.array(z.string()).optional(),
  crawlDelay: z.number().nonnegative().optional(),
})

const CrawlerConfigSchema = z.object({
  blockFreeAiScrapers: z.boolean().optional(),
  allowSearchEngines: z.boolean().optional(),
  allowPaidAgents: z.boolean().optional(),
  customRules: z.array(CrawlerRuleSchema).optional(),
  additionalBlockList: z.array(z.string()).optional(),
  additionalAllowList: z.array(z.string()).optional(),
})

const PricingConfigSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'amount must be a decimal number string e.g. "0.001"'),
  token: z.string().optional(),
  decimals: z.number().int().nonnegative().optional(),
})

// Lenient wallet validation. A malformed optional wallet logs a warning and
// is treated as unset rather than aborting the whole generate. This keeps a
// Solana-only deployment working when an unrelated EVM_ADDRESS happens to be
// malformed in .env, and mirrors the gating in the generator (a wallet is
// emitted only when its address parses cleanly). If every wallet ends up
// undefined the `.refine` below still fails the whole treasury, since x402
// with no recipient is not a valid configuration.
const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'evmAddress must be a 40-char hex EVM address (0x...)')
  .optional()
  .catch(({ error, input }) => {
    if (input !== undefined && input !== '') {
      const msg = error.issues[0]?.message ?? 'invalid format'
      console.warn(`herald: ignoring malformed evmAddress (${msg}); set EVM_ADDRESS to a valid 0x[40 hex] value or unset to skip EVM.`)
    }
    return undefined
  })

const solanaAddressSchema = z
  .string()
  .min(32, 'solanaAddress must be a base58 Solana public key')
  .optional()
  .catch(({ error, input }) => {
    if (input !== undefined && input !== '') {
      const msg = error.issues[0]?.message ?? 'invalid format'
      console.warn(`herald: ignoring malformed solanaAddress (${msg}); set SOLANA_ADDRESS to a valid base58 public key or unset to skip Solana.`)
    }
    return undefined
  })

const TreasuryConfigSchema = z
  .object({
    evmAddress: evmAddressSchema,
    evmChains: z.array(z.string()).optional(),
    solanaAddress: solanaAddressSchema,
    solanaNetwork: z.enum(['mainnet-beta', 'devnet']).optional(),
  })
  .refine(
    (t) => t.evmAddress !== undefined || t.solanaAddress !== undefined,
    { error: 'treasury must include at least one of evmAddress or solanaAddress (after lenient validation)' },
  )

const X402ConfigSchema = z.object({
  treasury: TreasuryConfigSchema,
  pricing: PricingConfigSchema.optional(),
  perPath: z.record(z.string(), PricingConfigSchema).optional(),
  facilitatorUrl: z.string().url().optional(),
  assets: z.record(z.string(), z.string()).optional(),
  maxTimeoutSeconds: z.number().int().positive().optional(),
  description: z.string().optional(),
})

const MppConfigSchema = z.object({
  secretKey: z.string().optional(),
  realm: z.string().optional(),
  tempoEnabled: z.boolean().optional(),
  tempoRecipient: z.string().optional(),
  tempoCurrency: z.string().optional(),
  tempoTestnet: z.boolean().optional(),
  stripeEnabled: z.boolean().optional(),
  stripeSecretKey: z
    .string()
    .startsWith('sk_', 'stripeSecretKey must start with sk_')
    .optional()
    .catch(({ error, input }) => {
      if (input !== undefined && input !== '') {
        const msg = error.issues[0]?.message ?? 'invalid format'
        console.warn(`herald: ignoring malformed stripeSecretKey (${msg}); set STRIPE_SECRET_KEY to a valid sk_... value or unset to skip Stripe.`)
      }
      return undefined
    }),
  stripeNetworkId: z.string().optional(),
  stripeCurrency: z.string().optional(),
  stripePaymentMethodTypes: z.array(z.string()).optional(),
  pricing: PricingConfigSchema.optional(),
  perPath: z.record(z.string(), PricingConfigSchema).optional(),
  description: z.string().optional(),
})

const Ap2ConfigSchema = z.object({
  presentations: z.array(z.string()).optional(),
  spec: z.string().url().optional(),
  description: z.string().optional(),
})

const OpenApiPaymentOfferSchema = z.object({
  intent: z.enum(['charge', 'session']),
  method: z.string().min(1, 'x-payment-info offer.method must be non-empty'),
  amount: z.union([z.string(), z.null()]),
  currency: z.string().optional(),
  description: z.string().optional(),
})

const OpenApiPaymentPathSchema = z.object({
  summary: z.string().optional(),
  description: z.string().optional(),
  offers: z.array(OpenApiPaymentOfferSchema).min(1, 'each openapi path must declare at least one payment offer'),
})

const OpenApiDiscoveryConfigSchema = z.object({
  title: z.string().optional(),
  version: z.string().optional(),
  paths: z.record(z.string().regex(/^\//, 'openapi.paths key must start with "/"'), OpenApiPaymentPathSchema),
})

const PaymentConfigSchema = z.object({
  protocols: z.array(ProtocolIdentifierSchema(PAYMENT_PROTOCOLS)).optional(),
  required: z.boolean().optional(),
  x402: X402ConfigSchema.optional(),
  mpp: MppConfigSchema.optional(),
  ap2: Ap2ConfigSchema.optional(),
  exemptUserAgents: z.array(z.string()).optional(),
  openapi: OpenApiDiscoveryConfigSchema.optional(),
})

const AuthorizationConfigSchema = z.object({
  enabled: z.boolean(),
  protocols: z.array(ProtocolIdentifierSchema(AUTH_PROTOCOLS)).optional(),
  identityRequired: z.boolean().optional(),
})

const McpEndpointSchema = z.union([
  z.url('MCP endpoint must be a valid URL'),
  z.object({
    url: z.url('MCP endpoint must be a valid URL'),
    description: z.string().optional(),
    version: z.string().optional(),
  }),
])

const McpServerCardSchema = z.object({
  name:    z.string().min(1, 'mcp.serverCard.name must be non-empty'),
  version: z.string().min(1, 'mcp.serverCard.version must be non-empty'),
  capabilities: z.object({
    tools:     z.boolean(),
    resources: z.boolean(),
    prompts:   z.boolean(),
  }),
})

const McpConfigSchema = z.object({
  endpoints: z.union([
    McpEndpointSchema,
    z.array(McpEndpointSchema).min(1, 'endpoints must contain at least one entry'),
  ]),
  serverCard: McpServerCardSchema.optional(),
})

const SkillEntrySchema = z.union([
  z.url('Skills URL must be a valid URL'),
  z.object({
    url: z.url('Skills URL must be a valid URL'),
    description: z.string().optional(),
    name: z.string().regex(/^[a-z0-9-]+$/, 'skill name must be lowercase alphanumeric + hyphens').optional(),
    type: z.enum(['skill-md', 'archive']).optional(),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/i, 'skill digest must be "sha256:<64-hex>"').optional(),
  }),
])

const SkillsConfigSchema = z.object({
  urls: z.union([
    SkillEntrySchema,
    z.array(SkillEntrySchema).min(1, 'urls must contain at least one entry'),
  ]),
})

const A2AEntrySchema = z.union([
  z.url('A2A AgentCard URL must be a valid URL'),
  z.object({
    url: z.url('A2A AgentCard URL must be a valid URL'),
    description: z.string().optional(),
  }),
])

const A2AConfigSchema = z.object({
  cards: z.union([
    A2AEntrySchema,
    z.array(A2AEntrySchema).min(1, 'cards must contain at least one entry'),
  ]),
})

const UcpEntrySchema = z.union([
  z.url('UCP profile URL must be a valid URL'),
  z.object({
    url: z.url('UCP profile URL must be a valid URL'),
    description: z.string().optional(),
  }),
])

const UcpConfigSchema = z.object({
  profiles: z.union([
    UcpEntrySchema,
    z.array(UcpEntrySchema).min(1, 'profiles must contain at least one entry'),
  ]),
})

const SecurityConfigSchema = z.object({
  contact: z.union([z.string().min(1, 'security.contact must not be empty'), z.array(z.string().min(1)).min(1)]),
  expires: z.string().refine(
    (v) => !Number.isNaN(Date.parse(v)),
    'security.expires must be a valid ISO 8601 timestamp',
  ).optional(),
  preferredLanguages: z.array(z.string().min(1)).optional(),
  canonical: z.url('security.canonical must be a valid URL').optional(),
  policy: z.url('security.policy must be a valid URL').optional(),
  acknowledgments: z.url('security.acknowledgments must be a valid URL').optional(),
  hiring: z.url('security.hiring must be a valid URL').optional(),
  encryption: z.url('security.encryption must be a valid URL').optional(),
})

export const AgenticConfigSchema = z.object({
  site: z.object({
    name: z.string().min(1, 'site.name must not be empty'),
    url: z.url('site.url must be a valid URL e.g. https://mysite.com'),
    description: z.string().optional(),
  }),
  content: ContentConfigSchema.optional(),
  crawlers: CrawlerConfigSchema.optional(),
  payments: PaymentConfigSchema.optional(),
  authorization: AuthorizationConfigSchema.optional(),
  mcp: McpConfigSchema.optional(),
  skills: SkillsConfigSchema.optional(),
  a2a: A2AConfigSchema.optional(),
  ucp: UcpConfigSchema.optional(),
  security: SecurityConfigSchema.optional(),
  headersExtras: z
    .array(
      z.object({
        source: z.string().min(1, 'headersExtras[].source must not be empty'),
        headers: z
          .array(z.object({ key: z.string().min(1), value: z.string() }))
          .min(1, 'headersExtras[].headers must include at least one entry'),
      }),
    )
    .optional(),
})

export type AgenticConfigInput = z.input<typeof AgenticConfigSchema>
