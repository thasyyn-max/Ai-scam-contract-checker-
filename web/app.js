/* Token Risk Scanner — minimal frontend.
   Renders on / (scan form) and /t/:chain/:address (permalink). No framework. */

const app = document.getElementById('app');

const VERDICT_LABEL = {
  'high-risk': 'HIGH RISK',
  'risky': 'RISKY',
  'caution': 'CAUTION',
  'no-red-flags': 'NO RED FLAGS',
};

const EXAMPLES = [
  { label: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  { label: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { label: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
];

// tiny inline icons (Lucide-style strokes) — no emoji per design system
const ICON = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.3 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
};

// data-source display names for the trust row (credibility signal)
const SOURCE_NAME = {
  'goplus': 'GoPlus', 'honeypot.is': 'Honeypot.is', 'etherscan': 'Etherscan',
  'geckoterminal': 'GeckoTerminal', 'solana-rpc': 'Solana RPC', 'rugcheck': 'RugCheck',
};

function relTime(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shell() {
  const wrap = el('div', 'wrap');

  const brand = el('div', 'brand');
  const link = el('a');
  link.href = '/';
  link.setAttribute('aria-label', 'Token Risk Scanner home');
  link.innerHTML = ICON.shield;
  link.appendChild(el('h1', null, 'Token Risk Scanner'));
  brand.appendChild(link);
  wrap.appendChild(brand);

  wrap.appendChild(el('p', 'tagline', 'Paste a token address. Get a risk score with the evidence — and what the contract owner can do to you, in plain English.'));

  const form = el('form', 'scan');
  form.setAttribute('novalidate', '');
  const field = el('div', 'field');
  const input = el('input');
  input.type = 'text';
  input.placeholder = '0x… or Solana mint address';
  input.setAttribute('aria-label', 'Token contract address');
  input.autocomplete = 'off';
  input.spellcheck = false;
  field.appendChild(input);
  const button = el('button', null, 'Scan');
  button.type = 'submit';
  form.appendChild(field);
  form.appendChild(button);
  wrap.appendChild(form);

  const examples = el('div', 'examples');
  examples.appendChild(el('span', 'lbl', 'Try:'));
  for (const ex of EXAMPLES) {
    const chip = el('button', 'chip', ex.label);
    chip.type = 'button';
    chip.dataset.address = ex.address;
    examples.appendChild(chip);
  }
  wrap.appendChild(examples);

  const output = el('div');
  output.setAttribute('aria-live', 'polite');
  wrap.appendChild(output);

  const method = el('p', 'method');
  method.innerHTML =
    '<strong>How scoring works.</strong> Deterministic checks run across multiple ' +
    'independent security sources; each red flag carries the exact evidence behind it. ' +
    'The AI explains the findings — it never sets the score.';
  wrap.appendChild(method);

  const footer = el('footer', 'site');
  footer.textContent =
    'Automated technical analysis of token contracts — not financial advice, not an endorsement. ' +
    'A high score means no red flags were found in the checks that ran, not that a token is safe. Always DYOR.';
  wrap.appendChild(footer);

  app.appendChild(wrap);
  return { form, input, button, examples, output };
}

function skeleton() {
  const s = el('div', 'skeleton');
  s.setAttribute('aria-hidden', 'true');
  const head = el('div', 'sk-head');
  head.appendChild(el('div', 'sk-bar sk-score'));
  const lines = el('div', 'sk-lines');
  lines.appendChild(el('div', 'sk-bar sk-line'));
  lines.appendChild(el('div', 'sk-bar sk-line short'));
  head.appendChild(lines);
  s.appendChild(head);
  for (let i = 0; i < 3; i++) s.appendChild(el('div', 'sk-bar sk-row'));
  return s;
}

function renderResult(output, result) {
  output.innerHTML = '';
  const card = el('div', 'result v-' + result.verdict);
  card.tabIndex = -1;

  // head
  const head = el('div', 'head');
  const scoreBlock = el('div', 'score-block');
  scoreBlock.appendChild(el('span', 'score', String(result.score)));
  scoreBlock.appendChild(el('span', 'score-max', '/100'));
  head.appendChild(scoreBlock);

  const meta = el('div', 'meta');
  const pill = el('span', 'pill');
  pill.appendChild(el('span', 'pill-txt', VERDICT_LABEL[result.verdict] || result.verdict));
  meta.appendChild(pill);

  const tokenName = (result.facts.name || 'Unknown token') + (result.facts.symbol ? ` · $${result.facts.symbol}` : '');
  const token = el('div', 'token');
  token.appendChild(document.createTextNode(`${tokenName} · ${result.chainName}`));
  token.appendChild(el('br'));
  token.appendChild(el('span', 'addr', result.address));
  meta.appendChild(token);

  // trust row — which sources were checked, and when
  const sources = (result.checks || []).filter((c) => c.ok).map((c) => SOURCE_NAME[c.source] || c.source);
  if (sources.length) {
    const trust = el('div', 'trust');
    trust.innerHTML = ICON.check;
    trust.appendChild(document.createTextNode('Checked · ' + sources.join(' · ')));
    const when = relTime(result.scannedAt);
    if (when) {
      trust.appendChild(el('span', 'sep', '·'));
      trust.appendChild(el('span', 'time', 'Scanned ' + when));
    }
    meta.appendChild(trust);
  }

  if (result.partial) {
    const p = el('div', 'partial', 'Partial scan — some sources were unavailable; score reflects the checks that ran');
    meta.appendChild(p);
  }
  head.appendChild(meta);
  card.appendChild(head);

  // meter
  const meter = el('div', 'meter');
  const fill = el('div', 'fill');
  meter.appendChild(fill);
  card.appendChild(meter);
  requestAnimationFrame(() => { fill.style.setProperty('--pct', String(result.score / 100)); });

  // explanation
  if (result.aiExplanation) {
    const exp = el('div', 'explanation');
    exp.appendChild(el('div', 'lbl', 'What this means'));
    exp.appendChild(el('p', null, result.aiExplanation));
    card.appendChild(exp);
  }

  // findings
  const findings = el('div', 'findings');
  for (const f of result.findings) {
    const row = el('div', 'finding');
    row.appendChild(el('div', 'sev sev-' + f.severity, f.severity));
    const body = el('div', 'body');
    const title = el('div', 'title');
    title.appendChild(el('span', null, f.title));
    if (f.deduction > 0) title.appendChild(el('span', 'ded', `−${f.deduction}`));
    body.appendChild(title);
    body.appendChild(el('div', 'evidence', f.evidence));
    row.appendChild(body);
    findings.appendChild(row);
  }
  if (result.findings.length === 0) findings.appendChild(el('div', 'finding', 'No findings.'));
  card.appendChild(findings);

  // actions
  const actions = el('div', 'actions');
  const permalink = `${location.origin}/t/${result.chain}/${result.address}`;

  const copyBtn = el('button');
  copyBtn.type = 'button';
  copyBtn.innerHTML = ICON.copy + '<span>Copy link</span>';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(permalink);
      copyBtn.querySelector('span').textContent = 'Copied';
      setTimeout(() => (copyBtn.querySelector('span').textContent = 'Copy link'), 1500);
    } catch { /* clipboard unavailable */ }
  });
  actions.appendChild(copyBtn);

  const shareX = el('a');
  const shareText = `${result.score}/100 ${VERDICT_LABEL[result.verdict]} — ${tokenName} on ${result.chainName}`;
  shareX.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(permalink)}`;
  shareX.target = '_blank';
  shareX.rel = 'noopener';
  shareX.innerHTML = ICON.share + '<span>Share</span>';
  actions.appendChild(shareX);

  const apiLink = el('a');
  apiLink.href = `/v1/scan/${result.chain}/${result.address}`;
  apiLink.target = '_blank';
  apiLink.rel = 'noopener';
  apiLink.innerHTML = ICON.code + '<span>JSON</span>';
  actions.appendChild(apiLink);

  card.appendChild(actions);
  output.appendChild(card);
  card.focus({ preventScroll: true });
}

async function runScan(output, url) {
  output.innerHTML = '';
  output.appendChild(skeleton());
  const status = el('div', 'status', 'Querying security data sources…');
  output.appendChild(status);
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      output.innerHTML = '';
      const err = el('div', 'error', data.error || `Scan failed (${res.status})`);
      err.setAttribute('role', 'alert');
      output.appendChild(err);
      return;
    }
    renderResult(output, data);
  } catch {
    output.innerHTML = '';
    const err = el('div', 'error', 'Network error — is the API running?');
    err.setAttribute('role', 'alert');
    output.appendChild(err);
  }
}

const { form, input, button, examples, output } = shell();

function scan(address) {
  if (!address) return;
  input.value = address;
  button.disabled = true;
  runScan(output, `/v1/scan?address=${encodeURIComponent(address)}`).finally(() => (button.disabled = false));
}

form.addEventListener('submit', (e) => { e.preventDefault(); scan(input.value.trim()); });
examples.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) scan(chip.dataset.address);
});

// permalink page: /t/:chain/:address — app div carries data attributes
const bootChain = app.dataset.chain;
const bootAddress = app.dataset.address;
if (bootChain && bootAddress) {
  input.value = bootAddress;
  button.disabled = true;
  runScan(output, `/v1/scan/${bootChain}/${bootAddress}`).finally(() => (button.disabled = false));
}
