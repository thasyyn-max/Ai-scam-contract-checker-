import sharp from 'sharp';
import type { ScanResult } from 'shared';

/**
 * 1200x630 share card — light, report-grade, matching the app's minimal-trusted
 * look. One loud score + verdict + the single most damning fact, so it reads when
 * cropped in a Twitter/Telegram unfurl. Muted verdict color is the only chroma.
 */

const VERDICT = {
  'high-risk': { color: '#c0362c', label: 'HIGH RISK' },
  'risky': { color: '#b1550c', label: 'RISKY' },
  'caution': { color: '#8a6d15', label: 'CAUTION' },
  'no-red-flags': { color: '#16794a', label: 'NO RED FLAGS' },
} as const;

const INK = '#14171c';
const MUTED = '#5a616e';
const DIM = '#99a0ac';
const BG = '#ffffff';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

export async function renderOgCard(result: ScanResult, siteHost: string): Promise<Buffer> {
  const style = VERDICT[result.verdict as keyof typeof VERDICT] ?? VERDICT['caution'];
  const symbol = escapeXml((result.facts.symbol || result.facts.name || 'TOKEN').slice(0, 18).toUpperCase());

  const worst = result.findings.filter((f) => f.deduction > 0)[0];
  const damning = worst
    ? escapeXml(worst.title.slice(0, 52))
    : 'No red flags in the checks that ran';

  const sources = (result.checks || []).filter((c) => c.ok).length;
  const sourceLine = sources
    ? `Checked across ${sources} security source${sources === 1 ? '' : 's'}${result.partial ? ' · partial scan' : ''}`
    : 'Automated contract analysis';

  const font = 'Segoe UI, Arial, sans-serif';
  const scoreLen = String(result.score).length;

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${BG}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${style.color}"/>

  <text x="72" y="118" font-family="${font}" font-size="30" font-weight="600" letter-spacing="1" fill="${DIM}">$${symbol} · ${escapeXml(result.chainName.toUpperCase())}</text>

  <text x="72" y="340" font-family="${font}" font-size="220" font-weight="800" fill="${style.color}">${result.score}</text>
  <text x="${72 + scoreLen * 128 + 24}" y="340" font-family="${font}" font-size="54" font-weight="600" fill="${DIM}">/100</text>

  <text x="72" y="420" font-family="${font}" font-size="52" font-weight="800" letter-spacing="1" fill="${style.color}">${style.label}</text>

  <text x="72" y="502" font-family="${font}" font-size="40" font-weight="600" fill="${INK}">${damning}</text>

  <line x1="72" y1="548" x2="1128" y2="548" stroke="#e4e7ec" stroke-width="2"/>
  <text x="72" y="590" font-family="${font}" font-size="26" fill="${MUTED}">${escapeXml(sourceLine)}</text>
  <text x="1128" y="590" text-anchor="end" font-family="${font}" font-size="26" font-weight="600" fill="${INK}">${escapeXml(siteHost)}</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
