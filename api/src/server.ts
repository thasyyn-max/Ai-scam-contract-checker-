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

const app = Fastify({ logger: true });
const webDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

await app.register(rateLimit, { max: 30, timeWindow: '1 minute' });
await app.register(fastifyStatic, { root: webDir, prefix: '/' });

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

// auto-detect chain: /v1/scan?address=...
app.get<{ Querystring: { address?: string } }>('/v1/scan', async (req, reply) => {
  const address = req.query.address;
  if (!address) return reply.code(400).send({ error: 'address query parameter required' });

  const target = await resolveTarget(address);
  if (typeof target === 'string') return reply.code(400).send({ error: target });

  return getOrScan(target.chain.id, target.address);
});

app.get<{ Params: { chain: string; address: string } }>('/v1/scan/:chain/:address', async (req, reply) => {
  const result = await getOrScan(req.params.chain, req.params.address);
  if ('error' in result) return reply.code(400).send(result);
  return result;
});

// OG share-card image
app.get<{ Params: { chain: string; address: string } }>('/og/:chain/:address.png', async (req, reply) => {
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
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#08090c">
<meta property="og:title" content="${title}">
<meta property="og:description" content="Risk score with evidence — what the contract owner can do to you, in plain English.">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
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
