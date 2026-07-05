import type { ChainInfo, TokenFacts } from 'shared';

export interface CollectorContext {
  /** DEX pool/pair addresses for this token (from market data) — used to exclude pools from holder math */
  poolAddresses: Set<string>;
  /** verified source code, when an explorer collector fetched it (feeds the LLM explainer) */
  sourceCode?: string;
  sourceCodeLanguage?: string;
}

export interface CollectorResult {
  source: string;
  ok: boolean;
  error?: string;
  facts: Partial<TokenFacts>;
}

export type Collector = (
  chain: ChainInfo,
  address: string,
  ctx: CollectorContext,
) => Promise<CollectorResult>;

/** fetch JSON with a hard timeout; throws on non-2xx */
export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 9000): Promise<any> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json', 'user-agent': 'scam-checker/0.1', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** wrap a collector body so failures become { ok:false } instead of exceptions */
export async function safeCollect(
  source: string,
  body: () => Promise<Partial<TokenFacts>>,
): Promise<CollectorResult> {
  try {
    const facts = await body();
    return { source, ok: true, facts };
  } catch (err) {
    return { source, ok: false, error: err instanceof Error ? err.message : String(err), facts: {} };
  }
}

/** GoPlus-style booleans arrive as "1"/"0" strings or {status:"1"} objects */
export function flag(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'object') return flag((v as any).status);
  if (v === '1' || v === 1 || v === true) return true;
  if (v === '0' || v === 0 || v === false) return false;
  return undefined;
}

export function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const BURN_ADDRESSES = new Set([
  '0x000000000000000000000000000000000000dead',
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000001',
  // Solana incinerator
  '1nc1nerator11111111111111111111111111111111',
]);
