/* Token Risk Scanner — minimal vanilla frontend.
   Renders on / (scan form) and /t/:chain/:address (permalink). */

const app = document.getElementById('app');

const VERDICT_LABEL = {
  'high-risk': 'HIGH RISK',
  'risky': 'RISKY',
  'caution': 'CAUTION',
  'no-red-flags': 'NO RED FLAGS DETECTED',
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shell() {
  const wrap = el('div', 'wrap');

  const header = el('header', 'site');
  const h1 = el('h1');
  const home = el('a', null, 'Token Risk Scanner');
  home.href = '/';
  h1.appendChild(home);
  header.appendChild(h1);
  header.appendChild(el('p', null, 'Paste a token address. Get the receipts — score, evidence, and what the owner can do to you.'));
  wrap.appendChild(header);

  const form = el('form', 'scan');
  const input = el('input');
  input.placeholder = '0x… or Solana mint address';
  input.autofocus = true;
  const button = el('button', null, 'Scan');
  form.appendChild(input);
  form.appendChild(button);
  wrap.appendChild(form);

  const output = el('div');
  wrap.appendChild(output);

  const footer = el('footer', 'site');
  footer.textContent =
    'Automated technical analysis of token contracts — not financial advice, not an endorsement. ' +
    'A high score means no red flags were detected in the checks that ran, not that a token is safe. Always DYOR.';
  wrap.appendChild(footer);

  app.appendChild(wrap);
  return { form, input, button, output };
}

function renderResult(output, result) {
  output.innerHTML = '';

  const card = el('div', 'result');
  const vClass = 'v-' + result.verdict;

  const head = el('div', 'head');
  head.appendChild(el('div', 'score ' + vClass, String(result.score)));
  const meta = el('div', 'meta');
  meta.appendChild(el('div', 'verdict ' + vClass, VERDICT_LABEL[result.verdict] || result.verdict));
  const tokenName = (result.facts.name || 'Unknown token') + (result.facts.symbol ? ` ($${result.facts.symbol})` : '');
  meta.appendChild(el('div', 'token', `${tokenName} · ${result.chainName} · ${result.address}`));
  if (result.partial) {
    meta.appendChild(el('div', 'partial', 'Partial scan — some data sources were unavailable; score reflects the checks that ran.'));
  }
  head.appendChild(meta);
  card.appendChild(head);

  if (result.aiExplanation) {
    const exp = el('div', 'explanation');
    exp.appendChild(el('div', 'label', 'What this means'));
    exp.appendChild(el('div', null, result.aiExplanation));
    card.appendChild(exp);
  }

  const findings = el('div', 'findings');
  for (const f of result.findings) {
    const row = el('div', 'finding');
    row.appendChild(el('div', 'sev sev-' + f.severity, f.severity));
    const body = el('div', 'body');
    body.appendChild(el('div', 'title', f.title + (f.deduction > 0 ? ` (−${f.deduction})` : '')));
    body.appendChild(el('div', 'evidence', f.evidence));
    row.appendChild(body);
    findings.appendChild(row);
  }
  if (result.findings.length === 0) {
    findings.appendChild(el('div', 'finding', 'No findings.'));
  }
  card.appendChild(findings);

  const actions = el('div', 'actions');
  const permalink = `${location.origin}/t/${result.chain}/${result.address}`;
  const copyBtn = el('button', null, 'Copy permalink');
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(permalink);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy permalink'), 1500);
  });
  actions.appendChild(copyBtn);

  const shareX = el('a', null, 'Share on X');
  const shareText = `${result.score}/100 ${VERDICT_LABEL[result.verdict]} — ${tokenName} on ${result.chainName}`;
  shareX.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(permalink)}`;
  shareX.target = '_blank';
  actions.appendChild(shareX);

  const apiLink = el('a', null, 'JSON');
  apiLink.href = `/v1/scan/${result.chain}/${result.address}`;
  apiLink.target = '_blank';
  actions.appendChild(apiLink);

  card.appendChild(actions);
  output.appendChild(card);
}

async function runScan(output, url) {
  output.innerHTML = '';
  output.appendChild(el('div', 'status', 'Scanning… querying security data sources (5–15s)'));
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      output.innerHTML = '';
      output.appendChild(el('div', 'error', data.error || `Scan failed (${res.status})`));
      return;
    }
    renderResult(output, data);
  } catch (err) {
    output.innerHTML = '';
    output.appendChild(el('div', 'error', 'Network error — is the API running?'));
  }
}

const { form, input, button, output } = shell();

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const address = input.value.trim();
  if (!address) return;
  button.disabled = true;
  runScan(output, `/v1/scan?address=${encodeURIComponent(address)}`).finally(() => (button.disabled = false));
});

// permalink page: /t/:chain/:address — app div carries data attributes
const bootChain = app.dataset.chain;
const bootAddress = app.dataset.address;
if (bootChain && bootAddress) {
  input.value = bootAddress;
  runScan(output, `/v1/scan/${bootChain}/${bootAddress}`);
}
