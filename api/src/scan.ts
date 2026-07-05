import type { ChainInfo, CheckStatus, ScanResult, TokenFacts } from 'shared';
import { chainById, detectAddressKind, scoreToken } from 'shared';
import { etherscanCollector } from './collectors/etherscan.ts';
import { detectChainViaGecko, geckoCollector } from './collectors/geckoterminal.ts';
import { goplusCollector } from './collectors/goplus.ts';
import { honeypotIsCollector } from './collectors/honeypotis.ts';
import { rugcheckCollector } from './collectors/rugcheck.ts';
import { solanaRpcCollector } from './collectors/solana.ts';
import type { Collector, CollectorContext, CollectorResult } from './collectors/types.ts';
import { explainResult } from './explain.ts';

/**
 * Merge order = precedence order (later collectors overwrite defined fields).
 * gecko runs FIRST (fills pool addresses used by holder math), then breadth
 * (goplus), then authoritative sources last: explorer for verification,
 * rugcheck/solana-rpc for authorities, honeypot.is for simulation facts.
 */
function collectorsFor(chain: ChainInfo): Collector[] {
  if (chain.kind === 'solana') {
    return [geckoCollector, goplusCollector, rugcheckCollector, solanaRpcCollector];
  }
  const list: Collector[] = [geckoCollector, goplusCollector, etherscanCollector];
  if (chain.depth === 'deep') list.push(honeypotIsCollector);
  return list;
}

export interface ScanOptions {
  /** skip the LLM explanation (used by golden-set tests) */
  noExplain?: boolean;
}

export async function scanToken(chain: ChainInfo, address: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const normalized = chain.kind === 'evm' ? address.toLowerCase() : address;
  const ctx: CollectorContext = { poolAddresses: new Set() };

  const collectors = collectorsFor(chain);
  const results: CollectorResult[] = [];

  // gecko first, sequentially, so ctx.poolAddresses is populated for the rest
  results.push(await collectors[0](chain, normalized, ctx));
  const rest = await Promise.all(collectors.slice(1).map((c) => c(chain, normalized, ctx)));
  results.push(...rest);

  // merge facts in precedence order
  const facts: TokenFacts = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r.facts)) {
      if (v !== undefined) (facts as any)[k] = v;
    }
  }

  const checks: CheckStatus[] = results.map((r) => ({
    source: r.source,
    ok: r.ok,
    ...(r.error ? { error: r.error } : {}),
  }));

  const outcome = scoreToken(facts, checks);
  const partial = checks.some((c) => !c.ok);

  const result: ScanResult = {
    chain: chain.id,
    chainName: chain.name,
    address: normalized,
    ...outcome,
    facts,
    checks,
    partial,
    scannedAt: new Date().toISOString(),
  };

  if (!opts.noExplain) {
    result.aiExplanation = await explainResult(result, ctx);
  }

  return result;
}

export interface ResolvedTarget {
  chain: ChainInfo;
  address: string;
}

/** Resolve an address (+ optional chain hint) to a scannable target, or an error string. */
export async function resolveTarget(address: string, chainHint?: string): Promise<ResolvedTarget | string> {
  const trimmed = address.trim();
  const kind = detectAddressKind(trimmed);
  if (kind === 'invalid') return 'Not a valid token address (expected 0x… EVM address or Solana mint)';

  if (chainHint) {
    const chain = chainById(chainHint);
    if (!chain) return `Unknown chain "${chainHint}"`;
    if (chain.kind !== kind) return `Address format does not match chain ${chain.name}`;
    return { chain, address: trimmed };
  }

  if (kind === 'solana') return { chain: chainById('solana')!, address: trimmed };

  // EVM without a hint: find where the deepest pool lives
  try {
    const detected = await detectChainViaGecko(trimmed);
    if (detected) return { chain: detected, address: trimmed };
  } catch {
    // fall through to default
  }
  // default to Ethereum; GoPlus will still report if it's another chain's token
  return { chain: chainById('eth')!, address: trimmed };
}
