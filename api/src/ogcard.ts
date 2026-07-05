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

// brand mark (shield + check), placed top-right; scaled from the 318.97×388.37 source
const LOGO = '<g transform="translate(1080,46) scale(0.135)">' +
  '<path fill="#2456d6" d="M149.65,385.57c6.03,3.73,13.64,3.73,19.67,0,24.1-14.92,86.45-56.56,117.88-105.94,37.89-59.55,31.61-87.91,31.05-208.19-.04-8.8-6.21-16.4-14.83-18.17-26.03-5.37-82.22-19.64-134.53-50.7-5.78-3.43-13.01-3.43-18.8,0C97.78,33.64,41.58,47.91,15.56,53.27c-8.62,1.78-14.79,9.37-14.83,18.17-.56,120.27-6.85,148.64,31.05,208.19,31.43,49.38,93.77,91.02,117.88,105.94Z"/>' +
  '<path fill="#e7ebf1" d="M93.53,158.78l57.67,52.68c2.31,2.11,5.87,2.06,8.13-.12l89.28-86.37c13.62-13.18,36.39-3.53,36.39,15.43v2.96c0,5.84-2.38,11.42-6.58,15.47l-108.65,104.53c-8.32,8.01-21.49,7.99-29.8-.03l-75.83-73.26c-4.19-4.04-6.55-9.62-6.55-15.44h0c0-18.66,22.17-28.43,35.94-15.85Z"/>' +
  '</g>';

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
  ${LOGO}

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
