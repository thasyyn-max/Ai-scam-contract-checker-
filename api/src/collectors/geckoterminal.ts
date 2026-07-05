import type { ChainInfo, TokenFacts } from 'shared';
import { chainByGeckoNetwork } from 'shared';
import { type Collector, type CollectorContext, fetchJson, safeCollect } from './types.ts';

const BASE = 'https://api.geckoterminal.com/api/v2';

/**
 * GeckoTerminal — pools, liquidity USD, pool age. Free, 10-30 req/min.
 * Chosen over DexScreener (whose ToS reportedly bans competing products).
 * Also fills ctx.poolAddresses so holder math can exclude pools.
 */
export const geckoCollector: Collector = (chain, address, ctx) =>
  safeCollect('geckoterminal', async () => {
    const url = `${BASE}/networks/${chain.geckoNetwork}/tokens/${address}/pools?page=1`;
    const json = await fetchJson(url);
    const pools: any[] = json?.data ?? [];
    if (pools.length === 0) throw new Error('no pools found');

    const facts: Partial<TokenFacts> = {};
    let liquidity = 0;
    let earliest: number | undefined;

    for (const pool of pools) {
      const attrs = pool.attributes ?? {};
      const reserve = Number(attrs.reserve_in_usd);
      if (Number.isFinite(reserve)) liquidity += reserve;
      if (attrs.pool_created_at) {
        const t = Date.parse(attrs.pool_created_at);
        if (Number.isFinite(t)) earliest = earliest === undefined ? t : Math.min(earliest, t);
      }
      if (attrs.address) ctx.poolAddresses.add(String(attrs.address).toLowerCase());
    }

    facts.liquidityUsd = Math.round(liquidity);
    if (earliest !== undefined) facts.tokenAgeHours = (Date.now() - earliest) / 3_600_000;

    // token logo + verified name/symbol (best-effort — never fail the collector over it)
    try {
      const meta = await fetchJson(`${BASE}/networks/${chain.geckoNetwork}/tokens/${address}`);
      const a = meta?.data?.attributes ?? {};
      if (a.name) facts.name = a.name;
      if (a.symbol) facts.symbol = a.symbol;
      if (typeof a.image_url === 'string' && a.image_url.startsWith('http') && !a.image_url.includes('missing')) {
        facts.logoUrl = a.image_url;
      }
    } catch { /* logo is optional */ }

    return facts;
  });

/**
 * Detect which chain an address lives on, using GeckoTerminal cross-network pool search.
 * Returns the chain of the deepest pool, or undefined.
 */
export async function detectChainViaGecko(address: string): Promise<ChainInfo | undefined> {
  const json = await fetchJson(`${BASE}/search/pools?query=${address}&page=1`);
  const pools: any[] = json?.data ?? [];
  let best: { chain: ChainInfo; reserve: number } | undefined;
  for (const pool of pools) {
    const network = pool?.relationships?.network?.data?.id ?? String(pool?.id ?? '').split('_')[0];
    const chain = network ? chainByGeckoNetwork(String(network)) : undefined;
    if (!chain) continue;
    const reserve = Number(pool?.attributes?.reserve_in_usd) || 0;
    if (!best || reserve > best.reserve) best = { chain, reserve };
  }
  return best?.chain;
}

export type { CollectorContext };
