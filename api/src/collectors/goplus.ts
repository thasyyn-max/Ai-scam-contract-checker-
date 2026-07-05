import type { ChainInfo, TokenFacts } from 'shared';
import { BURN_ADDRESSES, type Collector, fetchJson, flag, num, safeCollect } from './types.ts';

const BASE = 'https://api.gopluslabs.io/api/v1';

/**
 * GoPlus token_security — the broadest single source (~50 fields, EVM + Solana beta).
 * NOTE: GoPlus is also a competitor; keep it swappable behind this interface.
 */
export const goplusCollector: Collector = (chain, address, ctx) =>
  safeCollect('goplus', async () => {
    if (chain.kind === 'solana') return solana(address);
    return evm(chain, address, ctx.poolAddresses);
  });

async function evm(chain: ChainInfo, address: string, pools: Set<string>): Promise<Partial<TokenFacts>> {
  const url = `${BASE}/token_security/${chain.goPlusId}?contract_addresses=${address}`;
  const json = await fetchJson(url);
  const entry = json?.result?.[address.toLowerCase()];
  if (!entry) throw new Error('token not indexed by GoPlus');

  const facts: Partial<TokenFacts> = {
    name: entry.token_name || undefined,
    symbol: entry.token_symbol || undefined,
    isHoneypot: flag(entry.is_honeypot),
    buyTaxPct: scalePct(num(entry.buy_tax)),
    sellTaxPct: scalePct(num(entry.sell_tax)),
    sourceVerified: flag(entry.is_open_source),
    isProxy: flag(entry.is_proxy),
    isMintable: flag(entry.is_mintable),
    ownerCanChangeBalance: flag(entry.owner_change_balance),
    hiddenOwner: flag(entry.hidden_owner),
    selfDestruct: flag(entry.selfdestruct),
    transferPausable: flag(entry.transfer_pausable),
    hasBlacklist: flag(entry.is_blacklisted),
    slippageModifiable: flag(entry.slippage_modifiable),
    cannotSellAll: flag(entry.cannot_sell_all),
    externalCall: flag(entry.external_call),
    holderCount: num(entry.holder_count),
    creatorPct: scalePct(num(entry.creator_percent)),
  };

  const owner = (entry.owner_address ?? '').toLowerCase();
  if (entry.owner_address !== undefined) {
    facts.ownerRenounced = owner === '' || BURN_ADDRESSES.has(owner);
  }

  // LP locked/burned % — share of LP supply held by burn addresses or flagged locked
  if (Array.isArray(entry.lp_holders) && entry.lp_holders.length > 0) {
    let secured = 0;
    for (const lp of entry.lp_holders) {
      const p = num(lp.percent) ?? 0;
      if (flag(lp.is_locked) || BURN_ADDRESSES.has(String(lp.address ?? '').toLowerCase())) secured += p;
    }
    facts.lpLockedOrBurnedPct = Math.min(100, secured * 100);
  }

  // holder concentration — exclude burn addresses, DEX pools, and locked positions
  if (Array.isArray(entry.holders) && entry.holders.length > 0) {
    const relevant = entry.holders.filter((h: any) => {
      const a = String(h.address ?? '').toLowerCase();
      if (BURN_ADDRESSES.has(a) || pools.has(a)) return false;
      if (flag(h.is_locked)) return false;
      const tag = String(h.tag ?? '').toLowerCase();
      if (tag.includes('lp') || tag.includes('pair') || tag.includes('pool') || tag.includes('uniswap') || tag.includes('pancake')) return false;
      return true;
    });
    const pcts = relevant.map((h: any) => (num(h.percent) ?? 0) * 100);
    if (pcts.length > 0) {
      facts.topHolderPct = Math.max(...pcts);
      facts.top10HolderPct = pcts.slice(0, 10).reduce((s: number, p: number) => s + p, 0);
    }
  }

  return facts;
}

async function solana(address: string): Promise<Partial<TokenFacts>> {
  const url = `${BASE}/solana/token_security?contract_addresses=${address}`;
  const json = await fetchJson(url);
  const entry = json?.result?.[address];
  if (!entry) throw new Error('token not indexed by GoPlus (Solana beta)');

  const meta = entry.metadata ?? {};
  return {
    name: meta.name || undefined,
    symbol: meta.symbol || undefined,
    mintAuthorityActive: authorityActive(entry.mintable),
    freezeAuthorityActive: authorityActive(entry.freezable),
    ownerCanChangeBalance: authorityActive(entry.balance_mutable_authority),
    transferPausable: authorityActive(entry.non_transferable),
    metadataMutable: authorityActive(entry.metadata_mutable),
    holderCount: num(entry.holder_count),
    creatorPct: undefined, // creators[] lacks a reliable percent field across responses
  };
}

/** GoPlus Solana fields look like { status: "1", authority: [...] } */
function authorityActive(v: unknown): boolean | undefined {
  return flag(v);
}

/** GoPlus taxes are fractions (0.05 = 5%) */
function scalePct(v: number | undefined): number | undefined {
  return v === undefined ? undefined : v * 100;
}
