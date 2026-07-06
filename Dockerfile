# Token Risk Scanner — single-stage image.
# The app runs TypeScript directly via tsx (no compile step), so tsx must be
# installed even in production; hence --include=dev on npm ci.
FROM node:24-bookworm-slim

# Fonts for server-side OG share-card rendering (sharp/librsvg). The slim image
# ships no fonts, so the card's SVG text renders as tofu boxes (□) without this.
# Liberation Sans is metric-compatible with Arial (the card's font-family).
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# manifests first for layer caching (workspaces: shared + api)
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY api/package.json ./api/
RUN npm ci --include=dev

# source
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

# scan cache / history lives here — mount a volume to persist it
VOLUME ["/app/data"]

CMD ["npm", "start"]
