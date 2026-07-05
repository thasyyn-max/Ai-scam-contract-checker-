import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreToken, verdictForScore } from '../src/rubric.ts';
import { detectAddressKind } from '../src/chains.ts';
import type { TokenFacts } from '../src/types.ts';

const CLEAN: TokenFacts = {
  sourceVerified: true,
  isHoneypot: false,
  buyTaxPct: 0,
  sellTaxPct: 0,
  isProxy: false,
  isMintable: false,
  ownerCanChangeBalance: false,
  hiddenOwner: false,
  selfDestruct: false,
  transferPausable: false,
  hasBlacklist: false,
  slippageModifiable: false,
  cannotSellAll: false,
  externalCall: false,
  ownerRenounced: true,
  liquidityUsd: 5_000_000,
  lpLockedOrBurnedPct: 100,
  tokenAgeHours: 24 * 365,
  topHolderPct: 3,
  top10HolderPct: 20,
  holderCount: 100_000,
  creatorPct: 0,
};

test('clean blue-chip-like token scores 100 / no-red-flags', () => {
  const r = scoreToken(CLEAN);
  assert.equal(r.score, 100);
  assert.equal(r.verdict, 'no-red-flags');
  assert.ok(r.findings.every((f) => f.deduction === 0), 'only info findings expected');
});

test('honeypot is fatal: score 0 regardless of everything else being clean', () => {
  const r = scoreToken({ ...CLEAN, isHoneypot: true, honeypotReason: 'TRANSFER_FROM_FAILED' });
  assert.equal(r.score, 0);
  assert.equal(r.verdict, 'high-risk');
  assert.equal(r.findings[0].id, 'honeypot');
  assert.match(r.findings[0].evidence, /TRANSFER_FROM_FAILED/);
});

test('sell tax >= 50% is fatal even when honeypot sim passes', () => {
  const r = scoreToken({ ...CLEAN, sellTaxPct: 60 });
  assert.equal(r.score, 0);
  assert.ok(r.findings.some((f) => f.id === 'sell-tax-extreme'));
});

test('owner_change_balance is fatal', () => {
  const r = scoreToken({ ...CLEAN, ownerCanChangeBalance: true });
  assert.equal(r.score, 0);
});

test('unknown facts produce no deductions (empty facts = 100, but info-only)', () => {
  const r = scoreToken({});
  assert.equal(r.score, 100);
  assert.equal(r.findings.filter((f) => f.deduction > 0).length, 0);
});

test('typical fresh memecoin stack of flags lands in high-risk/risky band', () => {
  const r = scoreToken({
    ...CLEAN,
    sourceVerified: false,       // -40
    lpLockedOrBurnedPct: 10,     // -20
    topHolderPct: 35,            // -15
    tokenAgeHours: 3,            // -10
    liquidityUsd: 4_000,         // -10
    ownerRenounced: false,
  });
  assert.equal(r.score, 5);
  assert.equal(r.verdict, 'high-risk');
});

test('every deduction carries a non-empty evidence string', () => {
  const r = scoreToken({
    ...CLEAN,
    isMintable: true,
    isProxy: true,
    slippageModifiable: true,
    hasBlacklist: true,
    transferPausable: true,
    sellTaxPct: 12,
    buyTaxPct: 12,
  });
  for (const f of r.findings) {
    assert.ok(f.evidence.length > 5, `evidence missing for ${f.id}`);
    assert.ok(f.title.length > 0);
  }
});

test('solana authority flags deduct as designed', () => {
  const r = scoreToken({ ...CLEAN, mintAuthorityActive: true, freezeAuthorityActive: true });
  assert.equal(r.score, 40); // 100 - 30 - 30
  assert.equal(r.verdict, 'risky');
});

test('permanent delegate is critical', () => {
  const r = scoreToken({ ...CLEAN, permanentDelegate: true });
  assert.equal(r.score, 40);
  assert.equal(r.findings[0].severity, 'critical');
});

test('failed checks appear as info findings, never deduct', () => {
  const r = scoreToken(CLEAN, [
    { source: 'honeypot.is', ok: false, error: 'timeout' },
    { source: 'goplus', ok: true },
  ]);
  const info = r.findings.find((f) => f.id === 'check-unavailable-honeypot.is');
  assert.ok(info);
  assert.equal(info.deduction, 0);
  assert.equal(r.score, 100);
});

test('verdict bands', () => {
  assert.equal(verdictForScore(0), 'high-risk');
  assert.equal(verdictForScore(19), 'high-risk');
  assert.equal(verdictForScore(20), 'risky');
  assert.equal(verdictForScore(49), 'risky');
  assert.equal(verdictForScore(50), 'caution');
  assert.equal(verdictForScore(79), 'caution');
  assert.equal(verdictForScore(80), 'no-red-flags');
  assert.equal(verdictForScore(100), 'no-red-flags');
});

test('address detection: EVM vs Solana vs invalid', () => {
  assert.equal(detectAddressKind('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'), 'evm'); // USDC
  assert.equal(detectAddressKind('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 'solana'); // USDC SPL
  assert.equal(detectAddressKind('0x123'), 'invalid');
  assert.equal(detectAddressKind('hello world'), 'invalid');
  assert.equal(detectAddressKind('0OIl111111111111111111111111111111111111111'), 'invalid');
});
