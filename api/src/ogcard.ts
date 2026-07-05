import sharp from 'sharp';
import type { ScanResult } from 'shared';

/**
 * 1200x630 share card — the growth engine. Design goals (from research):
 * one loud verdict legible in a cropped screenshot + the single most damning
 * fact ("DEV HOLDS 91%") + the permalink domain as the receipt.
 */

const VERDICT_STYLE: Record<string, { color: string; label: string }> = {
  'high-risk': { color: '#ff2d55', label: 'HIGH RISK' },
  'risky': { color: '#ff9500', label: 'RISKY' },
  'caution': { color: '#ffd60a', label: 'CAUTION' },
  'no-red-flags': { color: '#30d158', label: 'NO RED FLAGS DETECTED' },
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

export async function renderOgCard(result: ScanResult, siteHost: string): Promise<Buffer> {
  const style = VERDICT_STYLE[result.verdict] ?? VERDICT_STYLE['caution'];
  const name = escapeXml((result.facts.symbol || result.facts.name || 'TOKEN').slice(0, 18).toUpperCase());

  // the single most damning fact = highest-deduction finding
  const worst = result.findings.filter((f) => f.deduction > 0)[0];
  const damning = worst
    ? escapeXml(worst.title.toUpperCase().slice(0, 46))
    : 'NO RED FLAGS IN CHECKS THAT RAN';

  const partialNote = result.partial ? ' · PARTIAL SCAN' : '';

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0d12"/>
  <rect x="0" y="0" width="1200" height="10" fill="${style.color}"/>
  <text x="70" y="120" font-family="Segoe UI, Arial, sans-serif" font-size="44" font-weight="700" fill="#8a919e">$${name} · ${escapeXml(result.chainName.toUpperCase())}${partialNote}</text>
  <text x="70" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="230" font-weight="900" fill="${style.color}">${result.score}</text>
  <text x="${70 + String(result.score).length * 130 + 30}" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="60" font-weight="700" fill="#4a5160">/100</text>
  <text x="70" y="420" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="800" fill="${style.color}">${style.label}</text>
  <text x="70" y="500" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="600" fill="#e8eaed">${damning}</text>
  <text x="70" y="575" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#4a5160">${escapeXml(siteHost)} — evidence, not advice</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
