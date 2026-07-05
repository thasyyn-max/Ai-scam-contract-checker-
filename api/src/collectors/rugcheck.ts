import type { TokenFacts } from 'shared';
import { config } from '../config.ts';
import { type Collector, fetchJson, num, safeCollect } from './types.ts';

/**
 * RugCheck — the Solana ecosystem's default checker; used as a cross-check.
 * Its LP-lock and insider analysis is better than what we can derive from
 * raw RPC at MVP stage, so it is authoritative for lpLockedOrBurnedPct on Solana.
 */
export const rugcheckCollector: Collector = (chain, address) =>
  safeCollect('rugcheck', async () => {
    if (chain.kind !== 'solana') throw new Error('solana only');

    const headers: Record<string, string> = {};
    if (config.rugcheckApiKey) headers.authorization = `Bearer ${config.rugcheckApiKey}`;

    const json = await fetchJson(
      `https://api.rugcheck.xyz/v1/tokens/${address}/report`,
      { headers },
    );

    const facts: Partial<TokenFacts> = {};
    if (json?.tokenMeta?.name) facts.name = json.tokenMeta.name;
    if (json?.tokenMeta?.symbol) facts.symbol = json.tokenMeta.symbol;
    if (json?.token?.mintAuthority !== undefined) facts.mintAuthorityActive = json.token.mintAuthority != null;
    if (json?.token?.freezeAuthority !== undefined) facts.freezeAuthorityActive = json.token.freezeAuthority != null;
    if (json?.tokenMeta?.mutable !== undefined) facts.metadataMutable = Boolean(json.tokenMeta.mutable);

    const liquidity = num(json?.totalMarketLiquidity);
    if (liquidity !== undefined) facts.liquidityUsd = Math.round(liquidity);

    // weighted LP-locked % across markets
    const markets: any[] = json?.markets ?? [];
    let lpTotal = 0;
    let lpWeighted = 0;
    for (const market of markets) {
      const lp = market?.lp ?? {};
      const base = num(lp.lpLockedUSD) !== undefined && num(lp.lpTotalSupply) ? num(lp.quoteUSD) : undefined;
      const lockedPct = num(lp.lpLockedPct);
      const weight = num(lp.lpTotalSupply) ?? 1;
      if (lockedPct !== undefined) {
        lpTotal += weight;
        lpWeighted += lockedPct * weight;
      }
      void base;
    }
    if (lpTotal > 0) facts.lpLockedOrBurnedPct = Math.min(100, lpWeighted / lpTotal);

    const topHolders: any[] = json?.topHolders ?? [];
    if (topHolders.length > 0) {
      const nonInsiderPcts = topHolders
        .filter((h) => !h?.owner || h.owner !== json?.creator)
        .map((h) => num(h.pct) ?? 0);
      if (nonInsiderPcts.length > 0) {
        facts.topHolderPct = Math.max(...nonInsiderPcts);
        facts.top10HolderPct = nonInsiderPcts.slice(0, 10).reduce((s, p) => s + p, 0);
      }
    }

    return facts;
  });
