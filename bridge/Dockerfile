FROM node:22-slim
# Baileys pulls libsignal from git.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs ./
ENV NODE_ENV=production SESSIONS_DIR=/data/sessions PORT=3001
RUN mkdir -p /data/sessions && chown -R node:node /data
# Mount a persistent volume here, or every org must re-scan after a redeploy.
VOLUME /data
EXPOSE 3001
USER node
CMD ["node", "server.mjs"]
