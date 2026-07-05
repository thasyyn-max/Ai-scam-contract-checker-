# Deploying Token Risk Scanner (Cloudflare Tunnel)

The app (API + frontend) runs from one container on your droplet. A **Cloudflare
Tunnel** puts it online at `https://rugsonar.com` **without opening any
ports** — so it co-hosts safely next to another app, and the origin IP stays hidden.

```
Droplet:      [ your other app on 80/443 ]   [ scanner app :3000 ]   [ cloudflared ]
Cloudflare:   rugsonar.com  --tunnel-->  app:3000
              (also caches static assets + /og images at the edge)
```

## Prerequisites

1. A **Cloudflare account** with a **domain added to it** (its nameservers pointed
   at Cloudflare). ⚠️ A domain can live on only one Cloudflare account — use a
   domain that's on *this* account, not a subdomain of one managed elsewhere.
2. **Docker** + compose on the droplet: `curl -fsSL https://get.docker.com | sh`
3. (Recommended) the two free API keys — the app works without them but every scan
   comes back "partial" and the AI explanation is skipped:
   - **Etherscan** — https://etherscan.io/apis (one V2 key = all EVM chains)
   - **Helius** — https://helius.dev (free Solana RPC)
   - Optional: **Anthropic** (AI explanations), **RugCheck** (Solana cross-check).

## Step 1 — Create the tunnel in Cloudflare

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**.
2. Choose **Cloudflared**, name it (e.g. `token-scanner`), **Save**.
3. On the "Install and run" screen, **copy the token** (the long string after
   `--token`). You don't need to run the shown command — the container does it.
4. Add a **Public Hostname**:
   - Subdomain (leave blank), Domain `rugsonar.com`  ← serves the apex
   - Type **HTTP**, URL **`app:3000`**  ← the compose service name + port
   - Save.

## Step 2 — Launch on the droplet

```bash
git clone https://github.com/thasyyn-max/Ai-scam-contract-checker-.git
cd Ai-scam-contract-checker-
cp .env.example .env
nano .env     # set CLOUDFLARE_TUNNEL_TOKEN, PUBLIC_BASE_URL=https://rugsonar.com, keys
docker compose up -d --build
```

Give it ~30 seconds, then visit `https://rugsonar.com`. Cloudflare
issues the HTTPS cert automatically — you're live.

## Step 3 — Cache the viral traffic (recommended)

So a screenshot going viral is served by Cloudflare, not your droplet:

- Cloudflare → **Caching** → **Cache Rules** → create a rule:
  *If URI Path starts with `/og/` OR `/tokens/` OR `/fonts/` OR matches
  `/styles.css` / `/app.js` / `/logo.svg`* → **Eligible for cache**, Edge TTL a few hours.
- Leave `/v1/scan*` **uncached** (the app has its own 30-min cache).

## Operate

```bash
docker compose logs -f app         # tail app logs
docker compose logs -f cloudflared # tunnel status
docker compose up -d --build       # deploy an update (git pull first)
docker compose down                # stop
```

The scan cache + history persist in the `scandata` volume across restarts.

## Notes

- **No inbound ports** are opened — you can firewall the droplet to allow only SSH.
- **`PUBLIC_BASE_URL`** must be your `https://rugsonar.com`, or share
  cards will show `localhost`.
- **Co-hosting:** this stack touches no host ports, so it runs alongside your
  existing app with zero conflict. Cloudflare's edge cache also absorbs traffic
  spikes, protecting the other app on the box.
- **No keys yet?** It still runs (good for a first smoke test) — expect "partial
  scan" notices until Etherscan + Helius are set.
