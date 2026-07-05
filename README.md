# Token Risk Scanner

Paste a token address → get a 0–100 risk score with **evidence** and a plain-English AI explanation of what the contract owner can do to you. Free consumer tool now; self-serve security API later.

## Architecture

- `shared/` — types, chain registry, and the deterministic scoring rubric (pure function, unit-tested). The LLM never sets the score.
- `api/` — Fastify (TypeScript) API-first backend: `/v1/scan/:chain/:address`, SQLite cache (`node:sqlite`), permalink pages with OG tags, PNG share cards.
- `web/` — static frontend served by the API.

Data sources (all free tiers, each behind a swappable collector interface): GoPlus, Honeypot.is, Etherscan V2, GeckoTerminal, Solana RPC (Helius optional), RugCheck. Degrades gracefully — a failed upstream becomes a "check unavailable" note, never a failed scan.

## Run

```bash
npm install
cp .env.example .env   # all keys optional; ANTHROPIC_API_KEY enables AI explanations
npm run dev            # http://127.0.0.1:3000
```

## Test

```bash
npm test               # rubric unit tests
npm run golden -w api  # live golden-set test against real tokens (network required)
```

## Chains

Deep coverage: Solana, Ethereum, BSC, Base. Basic coverage (GoPlus + market data): Polygon, Arbitrum, Optimism, Avalanche.

## Principles

- Never output "safe" — strongest phrasing is "no red flags detected".
- Every deduction carries its evidence string.
- Deterministic rubric sets the score; the AI layer only explains (contract source is treated as untrusted input).
- No paid badges, no score-for-pay, ever.
