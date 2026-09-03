# Build context is the repository root.
#
# Monkstore lab API, multi-stage build.
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/api/package.json ./
RUN npm install
COPY apps/api/tsconfig.json ./
COPY apps/api/prisma ./prisma
RUN npx prisma generate
COPY apps/api/src ./src
RUN npm run build

# ---- Runtime ----
FROM node:22-slim
# openssl for Prisma; iputils-ping so the /api/ping lab has a real baseline.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates iputils-ping \
  && rm -rf /var/lib/apt/lists/* \
  && chmod u+s "$(command -v ping)"
WORKDIR /app
ENV NODE_ENV=production
# Installed deps (including the Prisma CLI and generated client), build output
# and the prisma directory.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY apps/api/package.json ./
EXPOSE 3000
# Apply migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
