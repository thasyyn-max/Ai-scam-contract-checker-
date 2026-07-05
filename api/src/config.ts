export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, ''),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  etherscanApiKey: process.env.ETHERSCAN_API_KEY || undefined,
  heliusApiKey: process.env.HELIUS_API_KEY || undefined,
  rugcheckApiKey: process.env.RUGCHECK_API_KEY || undefined,
  /** cache TTL for a full scan result */
  cacheTtlMs: 30 * 60 * 1000,
  /** per-upstream request timeout */
  upstreamTimeoutMs: 9_000,
};
