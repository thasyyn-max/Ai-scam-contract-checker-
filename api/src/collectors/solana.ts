import type { TokenFacts } from 'shared';
import { config } from '../config.ts';
import { BURN_ADDRESSES, type Collector, safeCollect } from './types.ts';

/**
 * Direct Solana RPC — authoritative for mint/freeze authority and Token-2022
 * extensions (permanent delegate = the modern rug vector many scanners miss).
 * Uses Helius when a key is set, public mainnet RPC otherwise.
 */

// AMM authorities / programs whose token accounts are pools, not whales
const KNOWN_POOL_OWNERS = new Set([
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Raydium AMM v4 authority
  'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL', // Raydium CPMM authority
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',  // pump.fun AMM
  '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg', // pump.fun bonding curve authority
]);

export const solanaRpcCollector: Collector = (chain, address, ctx) =>
  safeCollect('solana-rpc', async () => {
    const rpcUrl = config.heliusApiKey
      ? `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`
      : 'https://api.mainnet-beta.solana.com';

    const facts: Partial<TokenFacts> = {};

    // 1) mint account: authorities + token-2022 extensions
    const mintInfo = await rpc(rpcUrl, 'getAccountInfo', [address, { encoding: 'jsonParsed' }]);
    const parsed = mintInfo?.value?.data?.parsed;
    if (parsed?.type !== 'mint') throw new Error('address is not an SPL token mint');
    const info = parsed.info ?? {};

    facts.mintAuthorityActive = info.mintAuthority != null;
    facts.freezeAuthorityActive = info.freezeAuthority != null;

    const extensions: any[] = info.extensions ?? [];
    facts.permanentDelegate = extensions.some((e) => e?.extension === 'permanentDelegate');
    const feeExt = extensions.find((e) => e?.extension === 'transferFeeConfig');
    if (feeExt) {
      const bps = Number(feeExt?.state?.newerTransferFee?.transferFeeBasisPoints ?? feeExt?.state?.olderTransferFee?.transferFeeBasisPoints);
      if (Number.isFinite(bps)) facts.sellTaxPct = bps / 100;
    }

    const supply = Number(info.supply);

    // 2) top token accounts
    const largest = await rpc(rpcUrl, 'getTokenLargestAccounts', [address]);
    const accounts: any[] = largest?.value ?? [];
    if (accounts.length > 0 && Number.isFinite(supply) && supply > 0) {
      // 3) resolve owners so pools/burns can be excluded from whale math
      const addrs = accounts.slice(0, 20).map((a) => a.address);
      const ownersInfo = await rpc(rpcUrl, 'getMultipleAccounts', [addrs, { encoding: 'jsonParsed' }]);
      const owners: (string | undefined)[] = (ownersInfo?.value ?? []).map(
        (acc: any) => acc?.data?.parsed?.info?.owner,
      );

      const holderPcts: number[] = [];
      for (let i = 0; i < accounts.length; i++) {
        const amount = Number(accounts[i]?.amount);
        if (!Number.isFinite(amount)) continue;
        const owner = owners[i];
        if (owner && (KNOWN_POOL_OWNERS.has(owner) || BURN_ADDRESSES.has(owner))) continue;
        if (BURN_ADDRESSES.has(String(accounts[i].address))) continue;
        holderPcts.push((amount / supply) * 100);
      }
      if (holderPcts.length > 0) {
        facts.topHolderPct = Math.max(...holderPcts);
        facts.top10HolderPct = holderPcts.slice(0, 10).reduce((s, p) => s + p, 0);
      }
    }

    return facts;
  });

async function rpc(url: string, method: string, params: unknown[], attempt = 0): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(config.upstreamTimeoutMs),
  });
  if (res.status === 429 && attempt < 2) {
    // public mainnet RPC throttles aggressively; brief backoff before giving up
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return rpc(url, method, params, attempt + 1);
  }
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message ?? json.error.code}`);
  return json.result;
}
