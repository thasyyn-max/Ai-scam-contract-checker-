import type { TokenFacts } from 'shared';
import { type Collector, fetchJson, safeCollect } from './types.ts';

/**
 * Honeypot.is — simulation-backed sellability verdict + measured taxes.
 * ETH / BSC / Base only. Keyless today, no SLA: treat as fragile and optional.
 * Authoritative over GoPlus for honeypot/tax facts (runs last in merge order).
 */
export const honeypotIsCollector: Collector = (chain, address) =>
  safeCollect('honeypot.is', async () => {
    if (chain.honeypotChainId === undefined) throw new Error(`unsupported chain ${chain.id}`);
    const url = `https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${chain.honeypotChainId}`;
    const json = await fetchJson(url);

    const facts: Partial<TokenFacts> = {};
    if (json?.token?.name) facts.name = json.token.name;
    if (json?.token?.symbol) facts.symbol = json.token.symbol;

    if (json?.honeypotResult && typeof json.honeypotResult.isHoneypot === 'boolean') {
      facts.isHoneypot = json.honeypotResult.isHoneypot;
      if (json.honeypotResult.honeypotReason) facts.honeypotReason = String(json.honeypotResult.honeypotReason);
    }
    const sim = json?.simulationResult;
    if (sim) {
      if (typeof sim.buyTax === 'number') facts.buyTaxPct = sim.buyTax;
      if (typeof sim.sellTax === 'number') facts.sellTaxPct = sim.sellTax;
    }
    if (json?.contractCode?.openSource !== undefined) {
      facts.sourceVerified = Boolean(json.contractCode.openSource);
    }
    return facts;
  });
