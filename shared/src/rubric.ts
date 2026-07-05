import type { CheckStatus, Finding, ScoreOutcome, Severity, TokenFacts, Verdict } from './types.ts';

/**
 * Deterministic scoring: start at 100, subtract per red flag, floor at 0.
 * Honeypot-class findings force the score to 0 regardless of the rest.
 *
 * This function is the single source of truth for the score. The LLM layer
 * may only explain or lower a verdict — it can never raise it.
 */

interface Rule {
  id: string;
  severity: Severity;
  deduction: number;
  /** forces score to 0 when triggered */
  fatal?: boolean;
  applies: (f: TokenFacts) => boolean;
  title: string;
  evidence: (f: TokenFacts) => string;
  source: string;
}

const pct = (n: number | undefined) => (n === undefined ? '?' : `${Math.round(n * 10) / 10}%`);
const usd = (n: number | undefined) =>
  n === undefined ? '?' : n >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${Math.round(n)}`;

const RULES: Rule[] = [
  // ── fatal: sellability ────────────────────────────────────────────────
  {
    id: 'honeypot', severity: 'critical', deduction: 100, fatal: true,
    applies: (f) => f.isHoneypot === true,
    title: 'Honeypot — buyers cannot sell',
    evidence: (f) => f.honeypotReason ? `Sell simulation failed: ${f.honeypotReason}` : 'Buy/sell simulation shows tokens cannot be sold',
    source: 'simulation',
  },
  {
    id: 'sell-tax-extreme', severity: 'critical', deduction: 100, fatal: true,
    applies: (f) => f.isHoneypot !== true && f.sellTaxPct !== undefined && f.sellTaxPct >= 50,
    title: 'Extreme sell tax — effective honeypot',
    evidence: (f) => `Sell tax measured at ${pct(f.sellTaxPct)} — selling loses most of your position`,
    source: 'simulation',
  },
  {
    id: 'owner-change-balance', severity: 'critical', deduction: 100, fatal: true,
    applies: (f) => f.ownerCanChangeBalance === true,
    title: 'Owner can edit wallet balances',
    evidence: () => 'Contract lets the owner modify any holder’s balance — a near-certain scam pattern',
    source: 'goplus',
  },
  {
    id: 'cannot-sell-all', severity: 'critical', deduction: 60,
    applies: (f) => f.cannotSellAll === true,
    title: 'Cannot sell entire holding',
    evidence: () => 'Contract blocks selling your full balance in one transaction',
    source: 'goplus',
  },
  {
    id: 'permanent-delegate', severity: 'critical', deduction: 60,
    applies: (f) => f.permanentDelegate === true,
    title: 'Permanent delegate can confiscate tokens',
    evidence: () => 'Token-2022 permanent-delegate extension lets a designated address move or burn anyone’s tokens',
    source: 'solana-rpc',
  },
  {
    id: 'selfdestruct', severity: 'critical', deduction: 50,
    applies: (f) => f.selfDestruct === true,
    title: 'Contract can self-destruct',
    evidence: () => 'Contract contains selfdestruct — it can be erased, taking guarantees with it',
    source: 'goplus',
  },

  // ── high ──────────────────────────────────────────────────────────────
  {
    id: 'unverified-source', severity: 'high', deduction: 40,
    applies: (f) => f.sourceVerified === false,
    title: 'Source code not verified',
    evidence: () => 'Contract source is unpublished — behavior cannot be inspected; legitimate tokens verify their code',
    source: 'explorer',
  },
  {
    id: 'freeze-authority', severity: 'high', deduction: 30,
    applies: (f) => f.freezeAuthorityActive === true,
    title: 'Freeze authority active',
    evidence: () => 'Token authority can freeze any holder’s tokens (the Solana honeypot switch)',
    source: 'solana-rpc',
  },
  {
    id: 'mint-authority', severity: 'high', deduction: 30,
    applies: (f) => f.mintAuthorityActive === true,
    title: 'Mint authority active',
    evidence: () => 'Token authority can mint unlimited new supply and dilute holders to zero',
    source: 'solana-rpc',
  },
  {
    id: 'hidden-owner', severity: 'high', deduction: 30,
    applies: (f) => f.hiddenOwner === true,
    title: 'Hidden owner',
    evidence: () => 'Ownership appears renounced but a concealed admin retains control',
    source: 'goplus',
  },
  {
    id: 'lp-unlocked', severity: 'high', deduction: 20,
    applies: (f) => f.lpLockedOrBurnedPct !== undefined && f.lpLockedOrBurnedPct < 50,
    title: 'Liquidity not locked',
    evidence: (f) => `Only ${pct(f.lpLockedOrBurnedPct)} of liquidity is burned/locked — the rest can be pulled at any time`,
    source: 'liquidity',
  },
  {
    id: 'proxy', severity: 'high', deduction: 20,
    applies: (f) => f.isProxy === true,
    title: 'Upgradeable proxy contract',
    evidence: () => 'Logic can be swapped after launch — every other guarantee is provisional',
    source: 'goplus',
  },

  // ── medium ────────────────────────────────────────────────────────────
  {
    id: 'mintable', severity: 'medium', deduction: 15,
    applies: (f) => f.isMintable === true,
    title: 'Owner can mint new supply',
    evidence: () => 'Mint function present — supply can be inflated',
    source: 'goplus',
  },
  {
    id: 'tax-modifiable', severity: 'medium', deduction: 15,
    applies: (f) => f.slippageModifiable === true,
    title: 'Taxes can be changed',
    evidence: () => 'Owner can raise buy/sell taxes after you buy (up to 100%)',
    source: 'goplus',
  },
  {
    id: 'transfer-pausable', severity: 'medium', deduction: 15,
    applies: (f) => f.transferPausable === true,
    title: 'Trading can be paused',
    evidence: () => 'Owner can pause transfers, trapping holders',
    source: 'goplus',
  },
  {
    id: 'top-holder', severity: 'medium', deduction: 15,
    applies: (f) => f.topHolderPct !== undefined && f.topHolderPct > 20,
    title: 'Single wallet holds outsized supply',
    evidence: (f) => `Largest non-pool wallet holds ${pct(f.topHolderPct)} of supply`,
    source: 'holders',
  },
  {
    id: 'sell-tax-high', severity: 'medium', deduction: 15,
    applies: (f) => f.sellTaxPct !== undefined && f.sellTaxPct >= 10 && f.sellTaxPct < 50,
    title: 'High sell tax',
    evidence: (f) => `Sell tax measured at ${pct(f.sellTaxPct)}`,
    source: 'simulation',
  },
  {
    id: 'lp-partial', severity: 'medium', deduction: 10,
    applies: (f) => f.lpLockedOrBurnedPct !== undefined && f.lpLockedOrBurnedPct >= 50 && f.lpLockedOrBurnedPct < 95,
    title: 'Liquidity only partially locked',
    evidence: (f) => `${pct(f.lpLockedOrBurnedPct)} of liquidity burned/locked — remainder is removable`,
    source: 'liquidity',
  },
  {
    id: 'blacklist', severity: 'medium', deduction: 10,
    applies: (f) => f.hasBlacklist === true,
    title: 'Blacklist function',
    evidence: () => 'Owner can block specific wallets from trading',
    source: 'goplus',
  },
  {
    id: 'buy-tax-high', severity: 'medium', deduction: 10,
    applies: (f) => f.buyTaxPct !== undefined && f.buyTaxPct >= 10,
    title: 'High buy tax',
    evidence: (f) => `Buy tax measured at ${pct(f.buyTaxPct)}`,
    source: 'simulation',
  },
  {
    id: 'low-liquidity', severity: 'medium', deduction: 10,
    applies: (f) => f.liquidityUsd !== undefined && f.liquidityUsd < 10_000,
    title: 'Very low liquidity',
    evidence: (f) => `Total liquidity ${usd(f.liquidityUsd)} — price is trivially manipulable and exits are expensive`,
    source: 'market',
  },
  {
    id: 'creator-holding', severity: 'medium', deduction: 10,
    applies: (f) => f.creatorPct !== undefined && f.creatorPct > 20,
    title: 'Creator holds large supply',
    evidence: (f) => `Deployer/creator wallet holds ${pct(f.creatorPct)} of supply`,
    source: 'holders',
  },
  {
    id: 'top10-concentration', severity: 'medium', deduction: 10,
    applies: (f) => f.top10HolderPct !== undefined && f.top10HolderPct > 70,
    title: 'Supply concentrated in few wallets',
    evidence: (f) => `Top 10 wallets hold ${pct(f.top10HolderPct)} of supply`,
    source: 'holders',
  },

  // ── low ───────────────────────────────────────────────────────────────
  {
    id: 'new-token', severity: 'low', deduction: 10,
    applies: (f) => f.tokenAgeHours !== undefined && f.tokenAgeHours < 24,
    title: 'Token is less than 24h old',
    evidence: (f) => `First liquidity pool created ~${Math.max(1, Math.round(f.tokenAgeHours!))}h ago`,
    source: 'market',
  },
  {
    id: 'few-holders', severity: 'low', deduction: 5,
    applies: (f) => f.holderCount !== undefined && f.holderCount < 50,
    title: 'Very few holders',
    evidence: (f) => `Only ${f.holderCount} holders`,
    source: 'holders',
  },
  {
    id: 'metadata-mutable', severity: 'low', deduction: 5,
    applies: (f) => f.metadataMutable === true,
    title: 'Metadata is mutable',
    evidence: () => 'Token name/image can be changed later (rebrand-and-repeat pattern)',
    source: 'solana-rpc',
  },
  {
    id: 'external-call', severity: 'low', deduction: 5,
    applies: (f) => f.externalCall === true,
    title: 'Calls external contracts on transfer',
    evidence: () => 'Transfer logic depends on another contract whose behavior can change',
    source: 'goplus',
  },
];

export function verdictForScore(score: number): Verdict {
  if (score < 20) return 'high-risk';
  if (score < 50) return 'risky';
  if (score < 80) return 'caution';
  return 'no-red-flags';
}

export function scoreToken(facts: TokenFacts, checks: CheckStatus[] = []): ScoreOutcome {
  const findings: Finding[] = [];
  let fatal = false;

  for (const rule of RULES) {
    if (!rule.applies(facts)) continue;
    if (rule.fatal) fatal = true;
    findings.push({
      id: rule.id,
      severity: rule.severity,
      deduction: rule.deduction,
      title: rule.title,
      evidence: rule.evidence(facts),
      source: rule.source,
    });
  }

  // positive/info findings (no deduction) — shown as context, never as "safe"
  if (facts.ownerRenounced === true && !fatal) {
    findings.push({
      id: 'renounced', severity: 'info', deduction: 0,
      title: 'Ownership renounced',
      evidence: 'No owner address retains admin functions (verify no hidden owner flag above)',
      source: 'goplus',
    });
  }
  if (facts.lpLockedOrBurnedPct !== undefined && facts.lpLockedOrBurnedPct >= 95) {
    findings.push({
      id: 'lp-secured', severity: 'info', deduction: 0,
      title: 'Liquidity burned or locked',
      evidence: `${Math.round(facts.lpLockedOrBurnedPct)}% of liquidity is burned/locked`,
      source: 'liquidity',
    });
  }
  for (const check of checks) {
    if (!check.ok) {
      findings.push({
        id: `check-unavailable-${check.source}`, severity: 'info', deduction: 0,
        title: `${check.source} check unavailable`,
        evidence: check.error ?? 'Upstream data source did not respond — score reflects remaining checks only',
        source: check.source,
      });
    }
  }

  const total = findings.reduce((sum, f) => sum + f.deduction, 0);
  const score = fatal ? 0 : Math.max(0, 100 - total);

  // severity order for display: critical first
  const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.deduction - a.deduction);

  return { score, verdict: verdictForScore(score), findings };
}
