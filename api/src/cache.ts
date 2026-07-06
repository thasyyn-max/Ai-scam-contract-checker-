import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScanResult } from 'shared';
import { config } from './config.ts';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'scans.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS scan_cache (
    chain TEXT NOT NULL,
    address TEXT NOT NULL,
    result_json TEXT NOT NULL,
    scanned_at INTEGER NOT NULL,
    PRIMARY KEY (chain, address)
  );
  CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain TEXT NOT NULL,
    address TEXT NOT NULL,
    score INTEGER NOT NULL,
    verdict TEXT NOT NULL,
    partial INTEGER NOT NULL,
    scanned_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_token ON scan_history (chain, address, scanned_at);
`);

const getStmt = db.prepare('SELECT result_json, scanned_at FROM scan_cache WHERE chain = ? AND address = ?');
const putStmt = db.prepare(
  'INSERT INTO scan_cache (chain, address, result_json, scanned_at) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(chain, address) DO UPDATE SET result_json = excluded.result_json, scanned_at = excluded.scanned_at',
);
const historyStmt = db.prepare(
  'INSERT INTO scan_history (chain, address, score, verdict, partial, scanned_at) VALUES (?, ?, ?, ?, ?, ?)',
);

export function getCachedScan(chain: string, address: string): ScanResult | undefined {
  const row = getStmt.get(chain, address) as { result_json: string; scanned_at: number } | undefined;
  if (!row) return undefined;
  if (Date.now() - row.scanned_at > config.cacheTtlMs) return undefined;
  try {
    return JSON.parse(row.result_json) as ScanResult;
  } catch {
    return undefined;
  }
}

/**
 * Cache the scan and append to history. Scans where every upstream failed are
 * NOT cached — an outage snapshot must not serve for 30 minutes.
 */
export function storeScan(result: ScanResult): void {
  const now = Date.now();
  const allFailed = result.checks.length > 0 && result.checks.every((c) => !c.ok);
  if (!allFailed) {
    putStmt.run(result.chain, result.address, JSON.stringify(result), now);
  }
  historyStmt.run(result.chain, result.address, result.score, result.verdict, result.partial ? 1 : 0, now);
}
