import { randomUUID, createHash } from 'node:crypto';
import { db } from './cache.ts';
import { config } from './config.ts';
import { createApiKey, isTier, type Tier } from './apikeys.ts';

/**
 * Cryptomus crypto billing — self-serve API-key purchases, paid in USDT/crypto.
 * Flow: customer hits /v1/checkout/:tier → we create a Cryptomus invoice and
 * redirect them to pay → Cryptomus calls our webhook → we verify the signature
 * and auto-issue the API key → the success page reveals it once.
 *
 * No card processor, no Stripe — works from anywhere, which is the whole point.
 * Inactive until CRYPTOMUS_MERCHANT_ID + CRYPTOMUS_API_KEY are set (post-moderation).
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    tier TEXT NOT NULL,
    amount TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    key_id INTEGER,
    raw_key TEXT,
    created_at INTEGER NOT NULL,
    paid_at INTEGER
  );
`);

/** Paid tiers and their USD price. Free needs no payment. */
export const TIER_PRICE_USD: Record<Exclude<Tier, 'free'>, number> = { indie: 29, pro: 99 };

const CRYPTOMUS_API = 'https://api.cryptomus.com/v1';
const PAID_STATUSES = new Set(['paid', 'paid_over']);

export function billingEnabled(): boolean {
  return Boolean(config.cryptomusMerchantId && config.cryptomusApiKey);
}

// ── signing (Cryptomus: md5(base64(json) + payment_api_key)) ──────────────
/** PHP-style json_encode: forward slashes are escaped. Cryptomus signs this form. */
export function phpJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/\//g, '\\/');
}

export function computeSign(payloadJson: string, apiKey: string): string {
  return createHash('md5').update(Buffer.from(payloadJson).toString('base64') + apiKey).digest('hex');
}

/** Verify the signature Cryptomus attaches to a webhook body. */
export function verifyWebhook(body: Record<string, unknown>, apiKey = config.cryptomusApiKey): boolean {
  const received = body.sign;
  if (typeof received !== 'string' || !apiKey) return false;
  const data = { ...body };
  delete data.sign;
  return computeSign(phpJson(data), apiKey) === received;
}

// ── orders ────────────────────────────────────────────────────────────────
const insertOrderStmt = db.prepare('INSERT INTO orders (order_id, tier, amount, status, created_at) VALUES (?, ?, ?, ?, ?)');
const getOrderStmt = db.prepare('SELECT order_id, tier, amount, status, raw_key FROM orders WHERE order_id = ?');
const markPaidStmt = db.prepare('UPDATE orders SET status = ?, key_id = ?, raw_key = ?, paid_at = ? WHERE order_id = ?');
const clearRawKeyStmt = db.prepare('UPDATE orders SET raw_key = NULL WHERE order_id = ?');

export interface Invoice { orderId: string; url: string; }

/** Create a Cryptomus invoice for a paid tier and return the hosted payment URL. */
export async function createInvoice(tier: Exclude<Tier, 'free'>): Promise<Invoice> {
  if (!billingEnabled()) throw new Error('billing not configured');
  const orderId = 'rs_' + randomUUID();
  const amount = String(TIER_PRICE_USD[tier]);
  const payload = {
    amount,
    currency: 'USD',
    order_id: orderId,
    url_callback: `${config.publicBaseUrl}/v1/webhook/cryptomus`,
    url_success: `${config.publicBaseUrl}/paid.html?order=${orderId}`,
    url_return: `${config.publicBaseUrl}/api.html`,
    lifetime: 3600,
  };
  const bodyStr = phpJson(payload);
  const res = await fetch(`${CRYPTOMUS_API}/payment`, {
    method: 'POST',
    headers: {
      merchant: config.cryptomusMerchantId!,
      sign: computeSign(bodyStr, config.cryptomusApiKey!),
      'Content-Type': 'application/json',
    },
    body: bodyStr,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { result?: { url?: string } };
  const url = json?.result?.url;
  if (!url) throw new Error(`Cryptomus returned no payment URL: ${JSON.stringify(json).slice(0, 200)}`);
  insertOrderStmt.run(orderId, tier, amount, 'new', Date.now());
  return { orderId, url };
}

export interface WebhookOutcome { ok: boolean; issued: boolean }

/**
 * Process a (already signature-verified) webhook. Idempotent: a key is issued
 * exactly once, on the first terminal "paid" status for an order.
 */
export function handleWebhook(body: Record<string, unknown>): WebhookOutcome {
  const orderId = body.order_id;
  const status = String(body.status ?? '');
  if (typeof orderId !== 'string') return { ok: false, issued: false };
  const order = getOrderStmt.get(orderId) as { status: string; tier: string } | undefined;
  if (!order) return { ok: false, issued: false };
  if (order.status === 'paid') return { ok: true, issued: false }; // already handled
  if (!PAID_STATUSES.has(status)) return { ok: true, issued: false }; // non-terminal, ignore
  if (!isTier(order.tier) || order.tier === 'free') return { ok: false, issued: false };
  const { rawKey, id } = createApiKey(`Cryptomus order ${orderId.slice(0, 15)}`, order.tier);
  markPaidStmt.run('paid', id, rawKey, Date.now(), orderId);
  return { ok: true, issued: true };
}

export interface OrderView { order_id: string; tier: string; amount: string; status: string; key?: string }

/** Order status for the success page. Reveals the issued key ONCE, then wipes it. */
export function getOrder(orderId: string): OrderView | null {
  const o = getOrderStmt.get(orderId) as
    | { order_id: string; tier: string; amount: string; status: string; raw_key: string | null }
    | undefined;
  if (!o) return null;
  const view: OrderView = { order_id: o.order_id, tier: o.tier, amount: o.amount, status: o.status };
  if (o.status === 'paid' && o.raw_key) {
    view.key = o.raw_key;
    clearRawKeyStmt.run(orderId); // one-time reveal
  }
  return view;
}
