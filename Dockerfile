# syntax=docker/dockerfile:1
# Imagem única: a API (NestJS) serve também o totem em "/" e o app da equipe em "/admin/".

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Dependências primeiro, para aproveitar o cache de camadas.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/kiosk/package.json apps/kiosk/
COPY apps/admin/package.json apps/admin/
COPY e2e/package.json e2e/
RUN npm ci --workspace=@burger-lab/api --workspace=@burger-lab/kiosk --workspace=@burger-lab/admin

COPY apps ./apps
COPY scripts ./scripts
RUN npm exec -w @burger-lab/api -- prisma generate \
 && npm run build \
 && npm run build:seed -w @burger-lab/api \
 && npm prune --omit=dev --workspace=@burger-lab/api --workspace=@burger-lab/kiosk --workspace=@burger-lab/admin

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/dist-seed ./apps/api/dist-seed
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/public ./apps/api/public

# Não roda como root.
USER node
WORKDIR /app/apps/api
EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Aplica migrações; com SEED_ON_BOOT=true também faz o seed idempotente (cardápio + usuário admin
# a partir de ADMIN_EMAIL/ADMIN_PASSWORD) antes de iniciar.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_ON_BOOT\" = \"true\" ]; then node dist-seed/seed.js; fi && exec node dist/main"]
