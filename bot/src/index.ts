/**
 * RugSonar Telegram bot — long-polling (no inbound ports needed, works behind the
 * Cloudflare tunnel). Scans any token contract address it sees: in a DM, or in a
 * group via /scan or (if privacy mode is off) any message containing an address.
 * Replies with the score + top finding + a link that unfurls the share card.
 *
 * Reuses the running scanner over the internal Docker network — no logic duplicated.
 * Idles quietly if TELEGRAM_BOT_TOKEN is unset, so it can ship dormant.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load the repo-root .env for local dev (Docker injects env via compose env_file).
try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'));
} catch {
  /* no .env — env comes from the runtime */
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = (process.env.RUGSONAR_API || 'http://app:3000').replace(/\/$/, '');
const SITE = (process.env.PUBLIC_BASE_URL || 'https://rugsonar.com').replace(/\/$/, '');
const BOT_KEY = process.env.BOT_API_KEY; // optional: an API key so the bot bypasses the anon per-min cap

const TG = `https://api.telegram.org/bot${TOKEN}`;

// EVM 0x…40hex | Tron T…34 base58 | Solana 32-44 base58. Tron before the general
// base58 rule so T-addresses aren't mistaken for Solana.
const ADDR_RE = /(0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|[1-9A-HJ-NP-Za-km-z]{32,44})/;

const VERDICT: Record<string, string> = {
  'high-risk': '🔴 HIGH RISK',
  risky: '🟠 RISKY',
  caution: '🟡 CAUTION',
  'no-red-flags': '🟢 NO RED FLAGS',
};

const WELCOME =
  '🛡️ <b>RugSonar</b> — paste a token contract address (Ethereum, BSC, Base, Solana, Tron, and more) ' +
  'and I\'ll score its rug risk and explain it.\n\n' +
  'In a group, use <code>/scan &lt;address&gt;</code> (or add me and turn off privacy mode to auto-scan every contract posted).';

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}

interface ScanResult {
  chain: string;
  chainName: string;
  address: string;
  score: number;
  verdict: string;
  facts: { name?: string; symbol?: string };
  findings: { title: string; deduction: number }[];
  partial?: boolean;
  error?: string;
}

async function tg(method: string, body: unknown): Promise<any> {
  const res = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(35_000),
  });
  return res.json();
}

async function scan(address: string): Promise<ScanResult | null> {
  try {
    const headers: Record<string, string> = BOT_KEY ? { authorization: `Bearer ${BOT_KEY}` } : {};
    const res = await fetch(`${API}/v1/scan?address=${encodeURIComponent(address)}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json()) as ScanResult;
    if (!res.ok || json.error || typeof json.score !== 'number') return null;
    return json;
  } catch {
    return null;
  }
}

function formatReply(r: ScanResult): string {
  const label = VERDICT[r.verdict] ?? r.verdict;
  const name = esc((r.facts.name || 'Token') + (r.facts.symbol ? ` ($${r.facts.symbol})` : ''));
  const worst = r.findings.filter((f) => f.deduction > 0)[0];
  const link = `${SITE}/t/${r.chain}/${r.address}`;
  let msg = `🛡️ <b>${name}</b> · ${esc(r.chainName)}\nScore: <b>${r.score}/100</b> — ${label}`;
  if (worst) msg += `\n⚠️ ${esc(worst.title)}`;
  if (r.partial) msg += `\n<i>(partial scan — some checks unavailable)</i>`;
  msg += `\n\n<a href="${link}">Full breakdown &amp; what the owner can do →</a>`;
  return msg;
}

function send(chatId: number, text: string, replyTo?: number) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_to_message_id: replyTo,
  });
}

async function handleMessage(msg: any): Promise<void> {
  const text: string = (msg.text || msg.caption || '').trim();
  const chatId: number = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (/^\/(start|help)\b/.test(text)) {
    await send(chatId, WELCOME);
    return;
  }

  const match = text.match(ADDR_RE);
  const address = match?.[0];
  if (!address) {
    // In DMs, nudge; in groups stay silent to avoid noise.
    if (isPrivate) await send(chatId, 'Send me a token contract address and I\'ll scan it. 🛡️');
    return;
  }

  const result = await scan(address);
  if (!result) {
    if (isPrivate) await send(chatId, "Couldn't scan that — is it a valid token contract address?");
    return; // groups: silent on non-tokens
  }
  await send(chatId, formatReply(result), msg.message_id);
}

async function main() {
  if (!TOKEN) {
    console.log('[bot] TELEGRAM_BOT_TOKEN not set — bot idle. Set it in .env and redeploy to enable.');
    await new Promise(() => {}); // idle forever, don't crash-loop
    return;
  }
  const me = await tg('getMe', {});
  console.log(`[bot] started as @${me?.result?.username ?? 'unknown'}`);

  let offset = 0;
  // Long-poll loop. getUpdates with timeout holds the connection open until a message
  // arrives; the offset acks processed updates so none are handled twice.
  for (;;) {
    try {
      const res = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
      for (const u of res?.result ?? []) {
        offset = u.update_id + 1;
        if (u.message) handleMessage(u.message).catch((e) => console.error('[bot] handle error', e));
      }
    } catch (e) {
      console.error('[bot] poll error', e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main();
