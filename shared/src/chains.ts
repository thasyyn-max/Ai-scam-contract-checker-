import type { ChainInfo } from './types.ts';

export const CHAINS: ChainInfo[] = [
  { id: 'solana', kind: 'solana', name: 'Solana', depth: 'deep', goPlusId: 'solana', geckoNetwork: 'solana' },
  { id: 'eth', kind: 'evm', name: 'Ethereum', depth: 'deep', goPlusId: '1', geckoNetwork: 'eth', honeypotChainId: 1, etherscanChainId: 1 },
  { id: 'bsc', kind: 'evm', name: 'BNB Chain', depth: 'deep', goPlusId: '56', geckoNetwork: 'bsc', honeypotChainId: 56, etherscanChainId: 56 },
  { id: 'base', kind: 'evm', name: 'Base', depth: 'deep', goPlusId: '8453', geckoNetwork: 'base', honeypotChainId: 8453, etherscanChainId: 8453 },
  { id: 'polygon', kind: 'evm', name: 'Polygon', depth: 'basic', goPlusId: '137', geckoNetwork: 'polygon_pos', etherscanChainId: 137 },
  { id: 'arbitrum', kind: 'evm', name: 'Arbitrum', depth: 'basic', goPlusId: '42161', geckoNetwork: 'arbitrum', etherscanChainId: 42161 },
  { id: 'optimism', kind: 'evm', name: 'Optimism', depth: 'basic', goPlusId: '10', geckoNetwork: 'optimism', etherscanChainId: 10 },
  { id: 'avalanche', kind: 'evm', name: 'Avalanche', depth: 'basic', goPlusId: '43114', geckoNetwork: 'avax', etherscanChainId: 43114 },
  // Tron: no Etherscan V2 / Honeypot.is coverage — GoPlus (tron) + GeckoTerminal + TronScan.
  { id: 'tron', kind: 'tron', name: 'TRON', depth: 'deep', goPlusId: 'tron', geckoNetwork: 'tron' },
];

export const chainById = (id: string): ChainInfo | undefined =>
  CHAINS.find((c) => c.id === id.toLowerCase());

/** Map a GeckoTerminal network slug back to our chain */
export const chainByGeckoNetwork = (network: string): ChainInfo | undefined =>
  CHAINS.find((c) => c.geckoNetwork === network);

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
// Tron base58check: always starts with 'T' and is exactly 34 chars. Must be tested
// BEFORE the Solana rule — both are base58, but a real Solana mint is 43-44 chars,
// so a 34-char 'T…' string is Tron in practice.
const TRON_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
// base58, typical Solana pubkey length; excludes 0, O, I, l
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type AddressKind = 'evm' | 'solana' | 'tron' | 'invalid';

export function detectAddressKind(address: string): AddressKind {
  if (EVM_RE.test(address)) return 'evm';
  if (TRON_RE.test(address)) return 'tron';
  if (SOLANA_RE.test(address)) return 'solana';
  return 'invalid';
}
