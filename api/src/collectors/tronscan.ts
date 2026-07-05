import type { TokenFacts } from 'shared';
import { config } from '../config.ts';
import { type Collector, fetchJson, safeCollect } from './types.ts';

/**
 * TronScan — the authoritative explorer for Tron (there is no Etherscan V2 or
 * Honeypot.is coverage here). Gives source-verification status, proxy flag, and
 * contract creation time (→ token age). Works keyless at a low rate limit; the
 * optional TRONSCAN_API_KEY raises it. Only runs for Tron.
 */
export const tronscanCollector: Collector = (chain, address) =>
  safeCollect('tronscan', async () => {
    if (chain.kind !== 'tron') throw new Error(`unsupported chain ${chain.id}`);

    const headers: Record<string, string> = config.tronscanApiKey
      ? { 'TRON-PRO-API-KEY': config.tronscanApiKey }
      : {};
    const json = await fetchJson(
      `https://apilist.tronscanapi.com/api/contract?contract=${address}`,
      { headers },
    );
    const entry = json?.data?.[0];
    if (!entry) throw new Error('contract not found on TronScan');

    const facts: Partial<TokenFacts> = {
      // TronScan verify_status: 2 = source verified (exact match). Authoritative.
      sourceVerified: entry.verify_status === 2,
      isProxy: typeof entry.is_proxy === 'boolean' ? entry.is_proxy : undefined,
    };
    if (entry.name) facts.name = entry.name;
    if (Number.isFinite(entry.date_created) && entry.date_created > 0) {
      facts.tokenAgeHours = (Date.now() - Number(entry.date_created)) / 3_600_000;
    }
    return facts;
  });
