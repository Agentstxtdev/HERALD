import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Zod v4 schema for AgenticConfig — validates user-supplied config at load time.
//
// Lives in the CLI (not @agentify/core) to preserve core's zero-runtime-dep
// guarantee. This is the only place user config crosses a trust boundary:
// `generate.ts` → loadConfig() → AgenticConfigSchema.safeParse().
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

const TreasuryConfigSchema = z
  .object({
    evmAddress: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, 'evmAddress must be a 40-char hex EVM address (0x...)')
      .optional(),
    evmChains: z.array(z.string()).optional(),
    solanaAddress: z
      .string()
      .min(32, 'solanaAddress must be a base58 Solana public key')
      .optional(),
    solanaNetwork: z.enum(['mainnet-beta', 'devnet']).optional(),
  })
  .refine(
    (t) => t.evmAddress !== undefined || t.solanaAddress !== undefined,
    { error: 'treasury must include at least one of evmAddress or solanaAddress' },
  )

const X402ConfigSchema = z.object({
  treasury: TreasuryConfigSchema,
  pricing: PricingConfigSchema.optional(),
  perPath: z.record(z.string(), PricingConfigSchema).optional(),
  facilitatorUrl: z.string().url().optional(),
  assets: z.record(z.string(), z.string()).optional(),
  maxTimeoutSeconds: z.number().int().positive().optional(),
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
    .optional(),
  stripeNetworkId: z.string().optional(),
  stripeCurrency: z.string().optional(),
  stripePaymentMethodTypes: z.array(z.string()).optional(),
  pricing: PricingConfigSchema.optional(),
  perPath: z.record(z.string(), PricingConfigSchema).optional(),
  description: z.string().optional(),
})

const PaymentConfigSchema = z.object({
  enabled: z.boolean().optional(),
  protocols: z.array(z.enum(['x402', 'mpp'])).optional(),
  x402: X402ConfigSchema.optional(),
  mpp: MppConfigSchema.optional(),
  exemptUserAgents: z.array(z.string()).optional(),
})

const AuthorizationConfigSchema = z.object({
  enabled: z.boolean(),
  protocols: z.array(z.string()).optional(),
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

const McpConfigSchema = z.object({
  endpoints: z.union([
    McpEndpointSchema,
    z.array(McpEndpointSchema).min(1, 'endpoints must contain at least one entry'),
  ]),
})

const SkillEntrySchema = z.union([
  z.url('Skills URL must be a valid URL'),
  z.object({
    url: z.url('Skills URL must be a valid URL'),
    description: z.string().optional(),
  }),
])

const SkillsConfigSchema = z.object({
  urls: z.union([
    SkillEntrySchema,
    z.array(SkillEntrySchema).min(1, 'urls must contain at least one entry'),
  ]),
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
})

export type AgenticConfigInput = z.input<typeof AgenticConfigSchema>
