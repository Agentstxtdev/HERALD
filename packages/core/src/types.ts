// ─────────────────────────────────────────────────────────────────────────────
// Agentic Web Standard — shared types
// Spec: https://github.com/agents-txt/herald/blob/main/spec/AGENTS-TXT-STANDARD.md
// ─────────────────────────────────────────────────────────────────────────────

import type { PaymentProtocolId, AuthProtocolId } from './protocols.js'

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

/**
 * AP2 (Agent Payments Protocol) mandate-layer config. AP2 is a trust layer that
 * composes with x402 / MPP / UCP rather than replacing them: it carries signed
 * `CheckoutMandate` and `PaymentMandate` Verifiable Digital Credentials so that
 * agent-initiated payments have non-repudiable proof of user intent. herald
 * does not implement the mandate exchange itself; this config exists so the
 * `ap2` identifier can be declared in `agents.txt` and a `payments.ap2` block
 * can surface in `agents.json` for pre-screening (spec §8.3 and §5.3).
 */
export interface Ap2Config {
  /**
   * Accepted Verifiable Digital Credential presentation formats for AP2 mandates
   * (e.g. ['sd-jwt-vc']). Pre-screening signal only; the authoritative list is
   * negotiated in the checkout flow per the AP2 specification.
   */
  presentations?: string[]
  /**
   * URL of the AP2 specification version the site implements (e.g.
   * `https://ap2-protocol.org/specification/v0.1`). Lets agents pin a revision.
   */
  spec?: string
  /**
   * Human-readable description of what the AP2 mandate layer covers on this
   * site. Surfaced as `payments.ap2.description` in `agents.json`.
   */
  description?: string
}

/**
 * Single offer in an x-payment-info extension per the MPP / Payment Discovery
 * draft (https://paymentauth.org/draft-payment-discovery-00.txt §3). Mirrors
 * the wire shape exactly so an agent reading /openapi.json sees the same
 * fields it would receive from a 402 WWW-Authenticate challenge.
 */
export interface OpenApiPaymentOffer {
  /** "charge" (per-request) or "session" (pay-as-you-go bucket). */
  intent: 'charge' | 'session'
  /** Payment method identifier — e.g. 'tempo', 'stripe', 'lightning', 'card', 'x402'. */
  method: string
  /**
   * Cost in the smallest currency unit (atomic). Null when pricing is dynamic
   * and only known at request time (e.g. variable-size resources). For 0.01
   * USDC at 6 decimals, use `'10000'`.
   */
  amount: string | null
  /** ISO 4217 fiat code or on-chain token contract address. */
  currency?: string
  /** Human-readable note (free text). */
  description?: string
}

export interface OpenApiPaymentPath {
  summary?: string
  description?: string
  /** One or more payment offers attached to this path. Multiple offers map to MPP's `offers[]` shorthand. */
  offers: OpenApiPaymentOffer[]
}

/**
 * Minimal OpenAPI discovery surface herald emits at /openapi.json. The schema
 * here intentionally only covers payable paths — the full OpenAPI document
 * shape is the user's responsibility when they have a real API to describe.
 * For sites that exist only to demonstrate payment flows (agents-txt.com), this
 * is enough to make the MPP auditor pass without inventing fake endpoints.
 */
export interface OpenApiDiscoveryConfig {
  title?: string
  version?: string
  /** Map of pathname → payment-offer metadata. */
  paths: Record<string, OpenApiPaymentPath>
}

export interface PaymentConfig {
  /**
   * Which payment protocols to accept. Agents pick what they support.
   * Default: ['mpp', 'x402'] — MPP first (session-based fiat + stablecoins);
   * x402 as fallback for pure on-chain micropayments.
   *
   * Accepts the registered identifiers ('x402', 'mpp') and any experimental
   * identifier with the `x-` prefix (e.g. 'x-mypay') per spec §3.1.
   * Experimental identifiers are advertised verbatim; their runtime gating
   * is the caller's responsibility (the generator does not enforce activity
   * for unknown identifiers).
   *
   * Whether the payments block is emitted into agents.txt / agents.json is
   * decided by the generator from `resolveActiveProtocols(payments)`: a
   * registered protocol is "active" only when its credentials are present.
   * If none are active, the block is omitted entirely.
   */
  protocols?: PaymentProtocolId[]
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
  /**
   * AP2 mandate layer config. Presence of this object signals AP2 mandate
   * support; it composes with the underlying rail (x402 or MPP) and does not
   * stand on its own.
   */
  ap2?: Ap2Config
  /** User-agents that bypass payment entirely */
  exemptUserAgents?: string[]
  /**
   * Optional OpenAPI discovery surface emitted at `/openapi.json`. Declares
   * payable paths with `x-payment-info` extensions per the MPP / Payment
   * Discovery draft. Independent of `protocols[]` — the site can announce a
   * payable path even when the runtime credentials live elsewhere; the wire
   * activation gate is the handler's responsibility, not the discovery file's.
   */
  openapi?: OpenApiDiscoveryConfig
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization types — agent identity + capability grants
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthorizationConfig {
  enabled: boolean
  /**
   * Authorization protocol identifiers. Registered: 'agent-auth'
   *   agent-auth — Agent Auth Protocol (agentauthprotocol.com).
   *   Discovery endpoint: /.well-known/agent-configuration
   *   Details (capabilities, endpoints, approval flows) live there, not here.
   *
   * Experimental identifiers MAY use the `x-` prefix per spec §3.1.
   */
  protocols?: AuthProtocolId[]
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

/**
 * Optional server-card metadata for the SEP-2127 discovery surface served at
 * /.well-known/mcp/server-card.json. Required only when `--mcp-card` is emitted.
 * The card describes the *server* (one per site); per-endpoint metadata stays
 * on the endpoint entry.
 */
export interface McpServerCard {
  name: string
  version: string
  /** Capability flags — all three required by the SEP-2127 auditor as booleans. */
  capabilities: {
    tools: boolean
    resources: boolean
    prompts: boolean
  }
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
  /**
   * SEP-2127 server card metadata. When present, herald emits
   * `/.well-known/mcp/server-card.json` describing this server. The card's
   * `transport.endpoint` is taken from the first entry in `endpoints`.
   */
  serverCard?: McpServerCard
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills types — agent skill package discoverability (agentskills.io standard)
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillEntry {
  url: string
  /** Short description of what this skill package teaches. Appears in agents.json only. */
  description?: string
  /**
   * Skill identifier (lowercase alphanumeric + hyphens). Required for the
   * Agent Skills Discovery index (`/.well-known/agent-skills/index.json` v0.2.0).
   * Defaults to the last path segment before SKILL.md when omitted (e.g.
   * `…/skills/adopt-agents-txt/SKILL.md` → `"adopt-agents-txt"`).
   */
  name?: string
  /**
   * Skill artifact type per Agent Skills Discovery v0.2.0. `'skill-md'` (a
   * SKILL.md file) or `'archive'` (a packaged bundle). Default: `'skill-md'`.
   */
  type?: 'skill-md' | 'archive'
  /**
   * SHA-256 digest of the skill artifact, formatted as `sha256:<hex>`. Required
   * for the Agent Skills Discovery index entry; agents use it to verify the
   * artifact they fetched matches what the site advertised.
   */
  digest?: string
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

// ─────────────────────────────────────────────────────────────────────────────
// A2A types — Agent2Agent Protocol AgentCard discoverability (a2a-protocol.org)
// ─────────────────────────────────────────────────────────────────────────────

export interface A2AEntry {
  url: string
  /** Short description of the agent's capability or role. Appears in agents.json only. */
  description?: string
}

export interface A2AConfig {
  /**
   * One or more A2A AgentCard URLs (a2a-protocol.org). Each URL points to a
   * JSON document describing one agent's identity, capabilities, and supported
   * extensions (including the x402 payments extension where applicable).
   *
   * The well-known path `/.well-known/agent-card.json` remains the primary
   * discovery surface for single-agent sites; this directive covers
   * multi-agent sites and AgentCards served at non-canonical paths.
   *
   * agents.txt carries only URLs; agent metadata stays in the AgentCard.
   * Pass a string for URL-only, or an object to include a description in agents.json.
   */
  cards: string | A2AEntry | (string | A2AEntry)[]
}

// ─────────────────────────────────────────────────────────────────────────────
// UCP types — Universal Commerce Protocol profile discoverability (ucp.dev)
// ─────────────────────────────────────────────────────────────────────────────

export interface UcpEntry {
  url: string
  /** Short description of what this UCP profile covers. Appears in agents.json only. */
  description?: string
}

export interface UcpConfig {
  /**
   * One or more UCP profile URLs (ucp.dev). Each URL points to a profile JSON
   * document declaring services, capabilities (including the AP2 mandate
   * extension), supported transport bindings, payment handlers, and signing
   * keys.
   *
   * The well-known path `/.well-known/ucp` remains the primary discovery
   * surface for single-profile sites; this directive covers sites with
   * multiple profiles or profiles served at non-canonical paths.
   *
   * agents.txt carries only URLs; profile metadata stays in the profile.
   * Pass a string for URL-only, or an object to include a description in agents.json.
   */
  profiles: string | UcpEntry | (string | UcpEntry)[]
}

// ─────────────────────────────────────────────────────────────────────────────
// WebMCP types — in-browser tool registration discoverability
// (webmachinelearning.github.io/webmcp)
// ─────────────────────────────────────────────────────────────────────────────

export interface WebMcpEntry {
  url: string
  /** Short description of the in-browser tools this page registers. Appears in agents.json only. */
  description?: string
}

export interface WebMcpConfig {
  /**
   * One or more page URLs whose documents register WebMCP tools through
   * `navigator.modelContext`. WebMCP exposes a page's own functions as
   * structured tools to an AI agent operating inside the browser tab.
   *
   * Where the `MCP:` directive advertises server-side endpoints for headless
   * agents, `WebMCP:` advertises pages for agents running in a browser-context
   * runtime (agents.txt spec §6.6). agents.txt carries only the page URL; the
   * tool definitions are registered at runtime by the page's own JavaScript.
   * Pass a string for URL-only, or an object to include a description in agents.json.
   */
  pages: string | WebMcpEntry | (string | WebMcpEntry)[]
}

export interface SecurityConfig {
  /**
   * Vulnerability disclosure contact. String or string[]; bare emails get a
   * `mailto:` prefix added automatically. RFC 9116 §2.5.4 requires at least
   * one Contact field for the file to be valid.
   */
  contact: string | string[]
  /**
   * ISO 8601 timestamp. When omitted, herald defaults to 365 days from
   * generation time (UTC midnight) to satisfy RFC 9116 §2.5.5.
   */
  expires?: string
  preferredLanguages?: string[]
  /** Absolute URL of the canonical security.txt. Defaults to <site.url>/.well-known/security.txt. */
  canonical?: string
  /** Absolute URL to the disclosure policy (e.g. SECURITY.md on the repo). */
  policy?: string
  acknowledgments?: string
  hiring?: string
  /** Absolute URL of a PGP public key for encrypted reports. */
  encryption?: string
}

/**
 * Extra raw `_headers` / `vercel.json` rules appended verbatim to the generated
 * headers config. Use for paths herald doesn't know about — custom static
 * directories, reference-deployment-specific surfaces, etc. Each entry mirrors
 * the Vercel headers shape; the generator translates to Cloudflare `_headers`
 * automatically.
 */
export interface ExtraHeaderRule {
  /** Path or glob (e.g. `/schema/*`). Matches Vercel + Cloudflare `_headers` semantics. */
  source: string
  headers: Array<{ key: string; value: string }>
}

export interface AgenticConfig {
  site: SiteConfig
  content?: ContentConfig
  crawlers?: CrawlerConfig
  payments?: PaymentConfig
  authorization?: AuthorizationConfig
  mcp?: McpConfig
  skills?: SkillsConfig
  a2a?: A2AConfig
  ucp?: UcpConfig
  webmcp?: WebMcpConfig
  security?: SecurityConfig
  /**
   * Extra header rules to append to the generated `_headers` / `vercel.json`.
   * Useful for paths herald has no built-in knowledge of (custom static
   * directories, externally-hosted schemas, etc.). Unmatched paths are
   * silently a no-op at the edge, so unused entries are harmless.
   */
  headersExtras?: ExtraHeaderRule[]
}

