import { randomBytes, createHash } from 'node:crypto';
import { db } from './cache.ts';

/**
 * API-key auth + monthly usage metering — the layer that turns the free scanner
 * into a sellable API. Keys are stored HASHED (sha256); the raw key is shown once
 * at creation and never recoverable. Metering counts keyed scans per calendar
 * month — that's the number you bill on. Anonymous (website) traffic is not keyed
 * and not metered here.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_usage (
    key_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_id, month)
  );
`);

/** Monthly scan quotas per tier. Priced under GoPlus's $199 floor. */
export const TIER_LIMITS = { free: 1_000, indie: 25_000, pro: 150_000 } as const;
export type Tier = keyof typeof TIER_LIMITS;

export function isTier(t: string): t is Tier {
  return t === 'free' || t === 'indie' || t === 'pro';
}

export interface ApiKeyRow {
  id: number;
  key_prefix: string;
  name: string;
  tier: Tier;
  active: number;
  created_at: number;
}

const KEY_PREFIX = 'rsk_live_';

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Current billing period as "YYYY-MM" (UTC). */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const insertKeyStmt = db.prepare(
  'INSERT INTO api_keys (key_hash, key_prefix, name, tier, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
);
const findKeyStmt = db.prepare(
  'SELECT id, key_prefix, name, tier, active, created_at FROM api_keys WHERE key_hash = ? AND active = 1',
);
const listKeysStmt = db.prepare('SELECT id, key_prefix, name, tier, active, created_at FROM api_keys ORDER BY id');
const revokeStmt = db.prepare('UPDATE api_keys SET active = 0 WHERE key_prefix = ? OR id = ?');
const usageGetStmt = db.prepare('SELECT count FROM api_usage WHERE key_id = ? AND month = ?');
const usageIncStmt = db.prepare(
  'INSERT INTO api_usage (key_id, month, count) VALUES (?, ?, 1) ' +
  'ON CONFLICT(key_id, month) DO UPDATE SET count = count + 1',
);

/** Issue a new key. Returns the raw key ONCE — it is not stored and cannot be shown again. */
export function createApiKey(name: string, tier: Tier = 'free'): { rawKey: string; prefix: string; id: number } {
  const rawKey = KEY_PREFIX + randomBytes(24).toString('hex');
  const prefix = rawKey.slice(0, KEY_PREFIX.length + 6); // e.g. rsk_live_ab12cd
  insertKeyStmt.run(hash(rawKey), prefix, name, tier, Date.now());
  const id = Number((db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id);
  return { rawKey, prefix, id };
}

/** Look up an active key by its raw value. Returns null if unknown/revoked. */
export function authenticateKey(rawKey: string): ApiKeyRow | null {
  const row = findKeyStmt.get(hash(rawKey)) as ApiKeyRow | undefined;
  return row ?? null;
}

export interface MeterResult {
  ok: boolean;
  used: number;
  limit: number;
}

/**
 * Atomically check the monthly quota and, if under, increment. node:sqlite is
 * synchronous and Node is single-threaded, so the read+write pair has no await
 * between them — no double-spend race.
 */
export function checkAndMeter(keyId: number, tier: Tier): MeterResult {
  const limit = TIER_LIMITS[tier];
  const month = currentMonth();
  const row = usageGetStmt.get(keyId, month) as { count: number } | undefined;
  const used = row?.count ?? 0;
  if (used >= limit) return { ok: false, used, limit };
  usageIncStmt.run(keyId, month);
  return { ok: true, used: used + 1, limit };
}

export function getUsage(keyId: number, tier: Tier) {
  const month = currentMonth();
  const row = usageGetStmt.get(keyId, month) as { count: number } | undefined;
  const used = row?.count ?? 0;
  const limit = TIER_LIMITS[tier];
  return { tier, month, used, limit, remaining: Math.max(0, limit - used) };
}

// ── management helpers (used by the CLI) ──────────────────────────────
export function listKeys(): ApiKeyRow[] {
  return listKeysStmt.all() as unknown as ApiKeyRow[];
}

export function revokeKey(prefixOrId: string): void {
  revokeStmt.run(prefixOrId, Number(prefixOrId) || -1);
}

/** Extract a bearer token from an Authorization header, if present. */
export function bearerToken(auth: string | undefined): string | undefined {
  if (auth && auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    return t || undefined;
  }
  return undefined;
}
