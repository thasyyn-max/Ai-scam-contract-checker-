export type ChainKind = 'evm' | 'solana' | 'tron';

export interface ChainInfo {
  /** our stable slug, used in URLs: eth, bsc, base, solana, polygon, arbitrum, optimism, avalanche */
  id: string;
  kind: ChainKind;
  name: string;
  /** deep = full collector set; basic = GoPlus + market data only */
  depth: 'deep' | 'basic';
  goPlusId: string;
  geckoNetwork: string;
  /** numeric chain id for Honeypot.is, when supported */
  honeypotChainId?: number;
  /** Etherscan V2 chainid, when supported */
  etherscanChainId?: number;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  /** points removed from 100; 0 for info findings */
  deduction: number;
  title: string;
  /** the receipt — the specific fact backing this finding */
  evidence: string;
  /** collector(s) that produced the underlying fact */
  source: string;
}

export interface CheckStatus {
  source: string;
  ok: boolean;
  error?: string;
}

/**
 * Normalized facts merged from all collectors.
 * Absent field = unknown (produces no deduction, but may cap confidence).
 */
export interface TokenFacts {
  name?: string;
  symbol?: string;
  /** token logo URL (from market metadata), for display */
  logoUrl?: string;

  // sellability / taxes (simulation-backed where available)
  isHoneypot?: boolean;
  honeypotReason?: string;
  buyTaxPct?: number;
  sellTaxPct?: number;

  // EVM owner privileges
  sourceVerified?: boolean;
  isProxy?: boolean;
  isMintable?: boolean;
  ownerCanChangeBalance?: boolean;
  hiddenOwner?: boolean;
  selfDestruct?: boolean;
  transferPausable?: boolean;
  hasBlacklist?: boolean;
  slippageModifiable?: boolean;
  cannotSellAll?: boolean;
  externalCall?: boolean;
  ownerRenounced?: boolean;

  // Solana authorities
  mintAuthorityActive?: boolean;
  freezeAuthorityActive?: boolean;
  permanentDelegate?: boolean;
  metadataMutable?: boolean;

  // market / distribution
  liquidityUsd?: number;
  /** % of LP supply burned or in known lockers (0-100) */
  lpLockedOrBurnedPct?: number;
  tokenAgeHours?: number;
  /** largest single non-pool, non-burn holder, % of supply (0-100) */
  topHolderPct?: number;
  top10HolderPct?: number;
  holderCount?: number;
  creatorPct?: number;
}

export type Verdict = 'high-risk' | 'risky' | 'caution' | 'no-red-flags';

export interface ScoreOutcome {
  score: number;
  verdict: Verdict;
  findings: Finding[];
}

export interface ScanResult extends ScoreOutcome {
  chain: string;
  chainName: string;
  address: string;
  facts: TokenFacts;
  checks: CheckStatus[];
  /** true when one or more collectors failed — score is a floor-of-knowledge, not a clean bill */
  partial: boolean;
  aiExplanation?: string | null;
  scannedAt: string;
}
