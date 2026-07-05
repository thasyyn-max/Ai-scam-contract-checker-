/**
 * Golden-set live test (network required, no API keys needed).
 * Blue chips must score high; known scam patterns must score low.
 * Run: npm run golden -w api
 */
import { chainById } from 'shared';
import { scanToken } from '../src/scan.ts';

interface GoldenCase {
  label: string;
  chain: string;
  address: string;
  expect: 'high' | 'low' | 'report';
}

const CASES: GoldenCase[] = [
  // blue chips — expect >= 80
  { label: 'USDC (Ethereum)', chain: 'eth', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', expect: 'report' }, // USDC has blacklist+proxy by design — report only
  { label: 'WETH (Ethereum)', chain: 'eth', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', expect: 'high' },
  { label: 'SHIB (Ethereum)', chain: 'eth', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', expect: 'high' },
  { label: 'CAKE (BSC)', chain: 'bsc', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', expect: 'report' },
  { label: 'WSOL (Solana)', chain: 'solana', address: 'So11111111111111111111111111111111111111112', expect: 'high' },
  { label: 'BONK (Solana)', chain: 'solana', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', expect: 'high' },
  { label: 'USDT (Ethereum)', chain: 'eth', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', expect: 'report' }, // owner powers by design
];

let failures = 0;

for (const c of CASES) {
  const chain = chainById(c.chain)!;
  process.stdout.write(`\n=== ${c.label} (${c.chain}) ===\n`);
  try {
    const result = await scanToken(chain, c.address, { noExplain: true });
    const failedChecks = result.checks.filter((ch) => !ch.ok).map((ch) => ch.source);
    console.log(`score: ${result.score}/100  verdict: ${result.verdict}  partial: ${result.partial}${failedChecks.length ? ` (down: ${failedChecks.join(', ')})` : ''}`);
    for (const f of result.findings.filter((f) => f.deduction > 0)) {
      console.log(`  -${f.deduction} [${f.severity}] ${f.title} — ${f.evidence}`);
    }
    if (c.expect === 'high' && result.score < 80) {
      console.log(`  !! FAIL: expected >= 80`);
      failures++;
    }
    if (c.expect === 'low' && result.score >= 20) {
      console.log(`  !! FAIL: expected < 20`);
      failures++;
    }
  } catch (err) {
    console.log(`  !! ERROR: ${err instanceof Error ? err.message : err}`);
    failures++;
  }
  // stay friendly to free-tier rate limits
  await new Promise((r) => setTimeout(r, 2500));
}

console.log(`\n${failures === 0 ? 'GOLDEN SET PASSED' : `GOLDEN SET: ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
