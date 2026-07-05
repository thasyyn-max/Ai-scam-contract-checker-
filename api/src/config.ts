import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load the project-root .env for local dev. `npm start` runs from the api/ workspace
// dir, so a cwd-relative lookup misses it — resolve it from this file's location
// (api/src/config.ts → ../../ = repo root). In Docker there's no .env (compose supplies
// env via env_file), so a missing file is expected — ignore it.
try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'));
} catch {
  /* no .env file present — environment variables come from the runtime */
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, ''),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  etherscanApiKey: process.env.ETHERSCAN_API_KEY || undefined,
  heliusApiKey: process.env.HELIUS_API_KEY || undefined,
  rugcheckApiKey: process.env.RUGCHECK_API_KEY || undefined,
  tronscanApiKey: process.env.TRONSCAN_API_KEY || undefined,
  /** cache TTL for a full scan result */
  cacheTtlMs: 30 * 60 * 1000,
  /** per-upstream request timeout */
  upstreamTimeoutMs: 9_000,
};
