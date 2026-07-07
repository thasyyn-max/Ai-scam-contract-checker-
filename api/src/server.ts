import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainById } from 'shared';
import type { ScanResult } from 'shared';
import { getCachedScan, storeScan } from './cache.ts';
import { config } from './config.ts';
import { renderOgCard } from './ogcard.ts';
import { resolveTarget, scanToken } from './scan.ts';
import { authenticateKey, bearerToken, checkAndMeter, getUsage } from './apikeys.ts';
import { billingEnabled, createInvoice, verifyWebhook, handleWebhook, getOrder } from './billing.ts';

const app = Fastify({ logger: true });
const webDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

// Baseline security headers on every response. CSP allows the inline scripts/styles
// in the static pages and https token-logo images from external CDNs; everything
// else is locked to same-origin.
const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  'content-security-policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
app.addHook('onSend', async (_req, reply, payload) => {
  reply.headers(SECURITY_HEADERS);
  return payload;
});

// Rate-limit only the expensive scan/image routes — NOT static assets or the
// permalink HTML, so a normal page load (many asset requests) never trips it.
await app.register(rateLimit, { global: false });
await app.register(fastifyStatic, { root: webDir, prefix: '/' });

// Per-minute burst limit. Anonymous (website) traffic buckets by IP at 30/min.
// Keyed API traffic buckets by key with a high ceiling — the MONTHLY quota (below)
// is the real limit for paying customers, not this.
const scanLimit = {
  config: {
    rateLimit: {
      max: (req: { headers: { authorization?: string } }) =>
        bearerToken(req.headers.authorization) ? 6000 : 30,
      timeWindow: '1 minute',
      keyGenerator: (req: { headers: { authorization?: string }; ip: string }) =>
        bearerToken(req.headers.authorization) ?? req.ip,
    },
  },
};

/**
 * API-key gate for /v1/scan. No key = anonymous (website + casual), allowed and
 * IP-limited. A key = authenticate + charge one scan against the monthly quota.
 */
async function apiKeyGate(
  req: { headers: { authorization?: string }; apiKey?: unknown },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  const token = bearerToken(req.headers.authorization);
  if (!token) return; // anonymous
  const key = authenticateKey(token);
  if (!key) return reply.code(401).send({ error: 'Invalid or inactive API key' });
  const meter = checkAndMeter(key.id, key.tier);
  if (!meter.ok) {
    return reply.code(429).send({
      error: `Monthly quota of ${meter.limit} scans reached on the "${key.tier}" tier. Resets on the 1st, or upgrade for a higher limit.`,
      tier: key.tier,
      used: meter.used,
      limit: meter.limit,
    });
  }
  req.apiKey = key;
}

const scanOpts = { config: scanLimit.config, preHandler: apiKeyGate };

async function getOrScan(chainId: string, address: string): Promise<ScanResult | { error: string }> {
  const chain = chainById(chainId);
  if (!chain) return { error: `Unknown chain "${chainId}"` };

  const normalized = chain.kind === 'evm' ? address.toLowerCase() : address;
  const cached = getCachedScan(chain.id, normalized);
  if (cached) return cached;

  const result = await scanToken(chain, normalized);
  storeScan(result);
  return result;
}

app.get('/healthz', async () => ({ ok: true }));

// ── crypto billing (Cryptomus) — self-serve API-key purchases ─────────────
// Start checkout: create an invoice and redirect the buyer to pay in crypto.
app.get<{ Params: { tier: string } }>('/v1/checkout/:tier', async (req, reply) => {
  const tier = req.params.tier;
  if (tier !== 'indie' && tier !== 'pro') return reply.code(400).send({ error: 'tier must be "indie" or "pro"' });
  if (!billingEnabled()) {
    reply.header('content-type', 'text/html; charset=utf-8');
    return reply.send(
      '<!doctype html><meta charset="utf-8"><title>Checkout coming soon</title>' +
      '<div style="font:16px/1.6 system-ui;max-width:520px;margin:12vh auto;padding:0 20px;text-align:center;color:#131722">' +
      '<h2>Self-serve checkout is almost ready</h2>' +
      '<p style="color:#59616f">Crypto payments are being activated. In the meantime, email ' +
      '<a href="mailto:hello@rugsonar.com">hello@rugsonar.com</a> and we\'ll set you up with a key today.</p>' +
      '<p><a href="/api.html">← Back to the API docs</a></p></div>',
    );
  }
  try {
    const { url } = await createInvoice(tier);
    return reply.redirect(url);
  } catch (err) {
    app.log.error(err);
    return reply.code(502).send({ error: 'Could not start checkout — try again or email hello@rugsonar.com' });
  }
});

// Cryptomus payment webhook — verify signature, then issue the key on "paid".
app.post('/v1/webhook/cryptomus', async (req, reply) => {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || !verifyWebhook(body)) return reply.code(403).send({ error: 'invalid signature' });
  handleWebhook(body);
  return reply.send({ ok: true }); // Cryptomus expects a 2xx to stop retrying
});

// Order status + one-time key reveal for the success page.
app.get<{ Params: { orderId: string } }>('/v1/order/:orderId', async (req, reply) => {
  const order = getOrder(req.params.orderId);
  if (!order) return reply.code(404).send({ error: 'order not found' });
  return order;
});

// manual/concierge crypto payment details for the docs "Pay with USDT" panel
app.get('/v1/pay-info', async () => ({
  network: 'Tron (TRC-20)',
  asset: 'USDT',
  prices: { indie: 29, pro: 99 },
  address: config.cryptoPayUsdtTrc20 ?? null,
  contact: 'hello@rugsonar.com',
}));

// caller's key usage — GET /v1/usage with Authorization: Bearer <key>
app.get('/v1/usage', async (req, reply) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) return reply.code(401).send({ error: 'Provide your key: Authorization: Bearer <key>' });
  const key = authenticateKey(token);
  if (!key) return reply.code(401).send({ error: 'Invalid or inactive API key' });
  return getUsage(key.id, key.tier);
});

// auto-detect chain: /v1/scan?address=...
app.get<{ Querystring: { address?: string } }>('/v1/scan', scanOpts, async (req, reply) => {
  const address = req.query.address;
  if (!address) return reply.code(400).send({ error: 'address query parameter required' });

  const target = await resolveTarget(address);
  if (typeof target === 'string') return reply.code(400).send({ error: target });

  return getOrScan(target.chain.id, target.address);
});

app.get<{ Params: { chain: string; address: string } }>('/v1/scan/:chain/:address', scanOpts, async (req, reply) => {
  const result = await getOrScan(req.params.chain, req.params.address);
  if ('error' in result) return reply.code(400).send(result);
  return result;
});

// OG share-card image
app.get<{ Params: { chain: string; address: string } }>('/og/:chain/:address.png', scanLimit, async (req, reply) => {
  const result = await getOrScan(req.params.chain, req.params.address);
  if ('error' in result) return reply.code(404).send(result);
  const host = config.publicBaseUrl.replace(/^https?:\/\//, '');
  const png = await renderOgCard(result as ScanResult, host);
  reply.header('content-type', 'image/png').header('cache-control', 'public, max-age=600');
  return reply.send(png);
});

// permalink page — the "receipt" URL with OG tags; content rendered client-side
app.get<{ Params: { chain: string; address: string } }>('/t/:chain/:address', async (req, reply) => {
  const { chain, address } = req.params;
  const base = config.publicBaseUrl;
  const chainInfo = chainById(chain);
  if (!chainInfo) return reply.code(404).send({ error: 'unknown chain' });

  const title = `Token risk scan — ${address.slice(0, 6)}…${address.slice(-4)} on ${chainInfo.name}`;
  const ogImage = `${base}/og/${chain}/${address}.png`;
  const pageUrl = `${base}/t/${chain}/${address}`;

  reply.header('content-type', 'text/html; charset=utf-8');
  return reply.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#f7f8fa">
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<meta property="og:title" content="${title}">
<meta property="og:description" content="Risk score with evidence — what the contract owner can do to you, in plain English.">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div id="app" data-chain="${chain}" data-address="${address}"></div>
<script src="/app.js"></script>
</body>
</html>`);
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
