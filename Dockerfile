# Token Risk Scanner — single-stage image.
# The app runs TypeScript directly via tsx (no compile step), so tsx must be
# installed even in production; hence --include=dev on npm ci.
FROM node:24-bookworm-slim

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
