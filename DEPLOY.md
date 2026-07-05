# Deploying Token Risk Scanner

The whole app (API + frontend) runs from one container. `docker compose` adds
Caddy in front for automatic HTTPS. Target: a small DO droplet (1GB is plenty).

## Prerequisites

1. A **domain** with an `A` record pointing at the droplet's IP.
2. Docker + the compose plugin on the droplet:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. (Recommended) two free API keys — the app works without them but every scan
   comes back "partial" and the AI explanation is skipped:
   - **Etherscan** — https://etherscan.io/apis (one V2 key covers all EVM chains)
   - **Helius** — https://helius.dev (free Solana RPC)
   - Optional: **Anthropic** (AI explanations), **RugCheck** (Solana cross-check).

## Launch

```bash
git clone https://github.com/thasyyn-max/Ai-scam-contract-checker-.git
cd Ai-scam-contract-checker-
cp .env.example .env
nano .env          # set DOMAIN, PUBLIC_BASE_URL (https://your-domain), and keys
docker compose up -d --build
```

Caddy provisions a Let's Encrypt cert on first boot (needs ports 80/443 open and
DNS already pointing at the box). Visit `https://your-domain` — you're live.

## Operate

```bash
docker compose logs -f app      # tail app logs
docker compose up -d --build    # deploy an update (git pull first)
docker compose down             # stop
```

The scan cache + history persist in the `scandata` volume across restarts.

## Notes

- **Binding:** compose sets `HOST=0.0.0.0` so the container is reachable; locally
  the app defaults to `127.0.0.1`.
- **`PUBLIC_BASE_URL`** must be your real `https://` domain, or share cards will
  show `localhost`.
- **Rate limits:** anonymous scans are capped at 30/min per IP (see `server.ts`).
  Caching absorbs repeat traffic on hot tokens, keeping you inside free tiers.
- **No keys yet?** It still runs — good for a first smoke test — just expect
  "partial scan" notices until Etherscan + Helius are set.
