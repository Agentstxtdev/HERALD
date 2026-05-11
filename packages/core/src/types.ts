// ─────────────────────────────────────────────────────────────────────────────
// Agentic Web Standard — shared types
// Spec: https://github.com/agentstxt/agents.txt/blob/main/spec/AGENTS-TXT-STANDARD.md
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteConfig {
  name: string
  url: string
  description?: string
}

export interface PageEntry {
  title: string
  url: string
  description?: string
}

export interface ContentSection {
  name: string
  pages: PageEntry[]
  optional?: boolean
}

/**
 * ContentDriver — the seam behind llms.txt content resolution.
 * Implement this to swap out the content source without touching the generator.
 */
export interface ContentDriver {
  resolve(): Promise<ContentSection[]>
}

export type LlmsDriver =
  | { type: 'sitemap'; sitemapUrl: string }
  | {
      type: 'firecrawl'
      /** Base URL to crawl */
      siteUrl: string
      /** Firecrawl API key (env: FIRECRAWL_API_KEY) */
      apiKey: string
      /** Max URLs returned. v2 default: 5000, max: 100000. We default to 5000. */
      limit?: number
      /** Order results by search relevance for this query */
      search?: string
      /** Sitemap handling: 'include' (default) | 'skip' | 'only' */
      sitemap?: 'include' | 'skip' | 'only'
      /** Include subdomains. Default: true */
      includeSubdomains?: boolean
      /** Drop URLs that carry query parameters. Default: true */
      ignoreQueryParameters?: boolean
    }
  | { type: 'static'; pages: PageEntry[]; sections?: ContentSection[] }
  | { type: 'manual'; sections: ContentSection[] }

export interface ContentConfig {
  driver: LlmsDriver
  /**
   * Source for /llms-full.txt — the long-form companion that inlines page content.
   * Typically points at a docs subdomain (docs.example.com) when the main `driver`
   * indexes the marketing site. Omit to skip llms-full.txt generation entirely.
   * Inline content scraping requires a Firecrawl driver here; other driver types
   * still produce a file but only with link + description (no page body).
   */
  fullTxt?: { driver: LlmsDriver }
}

export interface CrawlerRule {
  userAgent: string
  allow?: string[]
  disallow?: string[]
  crawlDelay?: number
}

export interface CrawlerConfig {
  blockFreeAiScrapers?: boolean
  allowSearchEngines?: boolean
  allowPaidAgents?: boolean
  customRules?: CrawlerRule[]
  additionalBlockList?: string[]
  additionalAllowList?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment types — multi-protocol, multi-chain
// ─────────────────────────────────────────────────────────────────────────────

export interface PricingConfig {
  /**
   * Major-unit amount as a decimal string (e.g. '0.01' for 1 cent of USDC,
   * or '1.00' for one dollar). Converted to atomic units on the wire using
   * `decimals` (default 6 for USDC).
   */
  amount: string
  /** Display-only token label (e.g. 'USDC', 'USD'). Not used on the wire. */
  token?: string
  /** Token decimals for atomic-unit conversion. Default: 6 (USDC). Stripe always uses 2. */
  decimals?: number
}

/** Treasury wallet addresses across chains */
export interface TreasuryConfig {
  /** EVM wallet address (0x…) — used for x402 on EVM chains */
  evmAddress?: string
  /** CAIP-2 chain IDs for EVM x402. Default: ['eip155:8453'] (Base) */
  evmChains?: string[]
  /** Solana wallet address (base58) — used for x402 on Solana */
  solanaAddress?: string
  /** Solana network. Default: 'mainnet-beta' */
  solanaNetwork?: 'mainnet-beta' | 'devnet'
}

/** x402 v2 protocol config (EVM + Solana, USDC by default) */
export interface X402Config {
  /** EVM and/or Solana treasury addresses */
  treasury: TreasuryConfig
  /**
   * Human-readable description of what the agent is paying for. Surfaced in
   * `agents.json` as `payments.x402.description` and may be propagated into the
   * 402 response as `accepts[].extra.description`.
   */
  description?: string
  /** Default price for protected routes */
  pricing?: PricingConfig
  /** Per-path pricing overrides. Keys are exact paths (with prefix). */
  perPath?: Record<string, PricingConfig>
  /**
   * Facilitator base URL. Default: https://x402.org/facilitator (free, public).
   * The middleware POSTs `${facilitatorUrl}/settle` for verification + settlement.
   */
  facilitatorUrl?: string
  /**
   * Override the asset (token contract or fiat code) per CAIP-2 network.
   * Defaults to USDC on Base/Ethereum mainnets and Solana mainnet/devnet.
   */
  assets?: Record<string, string>
  /** maxTimeoutSeconds for each accepts entry. Default: 60. */
  maxTimeoutSeconds?: number
}

/** Machine Payments Protocol config (mppx SDK — npm install mppx) */
export interface MppConfig {
  // ── HMAC security ────────────────────────────────────────────────────────
  /**
   * Secret key for stateless HMAC challenge binding (env: MPP_SECRET_KEY).
   * Required for production. Without it challenges are not cryptographically bound.
   */
  secretKey?: string

  /** Optional custom realm for WWW-Authenticate header. Default: site.name */
  realm?: string

  // ── Tempo stablecoin payments ─────────────────────────────────────────────
  /** Enable Tempo stablecoin payments. Default: true when tempoRecipient is set. */
  tempoEnabled?: boolean
  /** Tempo recipient wallet address (0x…). Required for Tempo payments. */
  tempoRecipient?: string
  /** Tempo token contract address. Default: USDC.e on Tempo mainnet. */
  tempoCurrency?: string
  /** Use Tempo testnet. Default: false. */
  tempoTestnet?: boolean

  // ── Stripe fiat payments ──────────────────────────────────────────────────
  /** Stripe payments enabled. Default: inferred true when stripeSecretKey + stripeNetworkId are set. */
  stripeEnabled?: boolean
  /** Stripe secret key (env: STRIPE_SECRET_KEY). Required for Stripe payments. */
  stripeSecretKey?: string
  /**
   * Stripe Business Network profile ID (env: STRIPE_NETWORK_ID).
   * Required for Stripe — obtain from your Stripe dashboard under "Network".
   */
  stripeNetworkId?: string

  // ── Charge options ────────────────────────────────────────────────────────
  /** Default charge amount */
  pricing?: PricingConfig
  /** Per-path charge amounts — keys are exact paths (with prefix). */
  perPath?: Record<string, PricingConfig>
  /**
   * Human-readable description of what the agent is paying for. Surfaced in
   * `agents.json` as `payments.mpp.description` and also propagated into the
   * MPP `WWW-Authenticate` challenge at request time.
   */
  description?: string
  /** Stripe currency (ISO 4217). Default: 'usd'. */
  stripeCurrency?: string
  /** Stripe payment_method_types. Default: ['card', 'link']. */
  stripePaymentMethodTypes?: string[]
}

export interface PaymentConfig {
  /**
   * Which payment protocols to accept. Agents pick what they support.
   * Default: ['mpp', 'x402'] — MPP first (session-based fiat + stablecoins);
   * x402 as fallback for pure on-chain micropayments.
   *
   * Whether the payments block is emitted into agents.txt / agents.json is
   * decided by the generator from `resolveActiveProtocols(payments)`: a
   * protocol is "active" only when its credentials are present. If none are
   * active, the block is omitted entirely.
   */
  protocols?: Array<'x402' | 'mpp'>
  /**
   * Site-level policy: when true, emits `Payments: required` — every
   * interaction with the site requires payment, no free path exists.
   * Symmetric with `authorization.identityRequired`.
   */
  required?: boolean
  /** x402 config (EVM + Solana on-chain micropayments) */
  x402?: X402Config
  /** MPP config (Stripe — fiat + stablecoins, session-based) */
  mpp?: MppConfig
  /** User-agents that bypass payment entirely */
  exemptUserAgents?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization types — agent identity + capability grants
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthorizationConfig {
  enabled: boolean
  /**
   * Authorization protocol identifiers. Valid in v0.2: 'agent-auth'
   * agent-auth — Agent Auth Protocol (agentauthprotocol.com)
   *   Discovery endpoint: /.well-known/agent-configuration
   *   Details (capabilities, endpoints, approval flows) live there, not here.
   */
  protocols?: string[]
  /**
   * When true, emits `Identity: required` — site-level policy that agents must
   * authenticate before any interaction, not just before capability execution.
   */
  identityRequired?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP types — Model Context Protocol server discoverability
// ─────────────────────────────────────────────────────────────────────────────

export interface McpEndpoint {
  url: string
  /** Short description of what this MCP server exposes. Appears in agents.json only. */
  description?: string
  /**
   * Optional MCP transport version this endpoint conforms to (e.g. '2025-03-26').
   * Lets agents pre-check compatibility without opening a session. Surfaced as
   * `mcp[].version` in agents.json. Omit when unsure; agents fall back to
   * negotiating at session start.
   */
  version?: string
}

export interface McpConfig {
  /**
   * One or more MCP server endpoints (Streamable HTTP transport).
   * The MCP spec defines no standard well-known path — agents.txt fills this gap.
   * Each URL must support both POST and GET (per MCP spec 2025-03-26+).
   * Auth for these endpoints is NOT declared here — it is communicated by the
   * MCP server at connection time, or declared site-wide in `authorization`.
   * Pass a string for URL-only, or an object to include a description in agents.json.
   */
  endpoints: string | McpEndpoint | (string | McpEndpoint)[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills types — agent skill package discoverability (agentskills.io standard)
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillEntry {
  url: string
  /** Short description of what this skill package teaches. Appears in agents.json only. */
  description?: string
}

export interface SkillsConfig {
  /**
   * One or more skill package URLs (agentskills.io standard).
   * Service-consumption skills — teach agents how to USE this site's API/service.
   * Distinct from repo-level dev skills (AGENTS.md / CLAUDE.md).
   * A skill URL may be gated behind payment; agents handle 402 normally.
   * Pass a string for URL-only, or an object to include a description in agents.json.
   */
  urls: string | SkillEntry | (string | SkillEntry)[]
}

export interface AgenticConfig {
  site: SiteConfig
  content?: ContentConfig
  crawlers?: CrawlerConfig
  payments?: PaymentConfig
  authorization?: AuthorizationConfig
  mcp?: McpConfig
  skills?: SkillsConfig
}

