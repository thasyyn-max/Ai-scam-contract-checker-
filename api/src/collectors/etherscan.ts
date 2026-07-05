import type { TokenFacts } from 'shared';
import { config } from '../config.ts';
import { type Collector, fetchJson, safeCollect } from './types.ts';

/**
 * Etherscan V2 — one key, 50+ chains. Source verification is authoritative here.
 * Also captures the verified source into ctx for the LLM explainer.
 * Skipped (not-ok, "no API key") when ETHERSCAN_API_KEY is absent.
 */
export const etherscanCollector: Collector = (chain, address, ctx) =>
  safeCollect('etherscan', async () => {
    if (!config.etherscanApiKey) throw new Error('no API key configured');
    if (chain.etherscanChainId === undefined) throw new Error(`unsupported chain ${chain.id}`);

    const url =
      `https://api.etherscan.io/v2/api?chainid=${chain.etherscanChainId}` +
      `&module=contract&action=getsourcecode&address=${address}&apikey=${config.etherscanApiKey}`;
    const json = await fetchJson(url);
    const entry = json?.result?.[0];
    if (!entry) throw new Error('empty result');

    const source = String(entry.SourceCode ?? '');
    const facts: Partial<TokenFacts> = { sourceVerified: source.length > 0 };
    if (source.length > 0) {
      // Etherscan wraps multi-file sources in {{ }} JSON — keep raw text either way,
      // truncated to keep LLM input bounded.
      ctx.sourceCode = source.slice(0, 120_000);
      ctx.sourceCodeLanguage = entry.CompilerVersion?.startsWith('vyper') ? 'vyper' : 'solidity';
      if (!facts.name && entry.ContractName) facts.name = entry.ContractName;
    }
    return facts;
  });
