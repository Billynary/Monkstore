// Monkstore lab backend — Fastify + TypeScript entrypoint.
//
// This is an INTENTIONALLY VULNERABLE training app. Do not expose it publicly.
// Secure-core routes live under src/routes/*; the classic lab vulns live under
// src/lab/*. New training vulns in the shop/currency flows are marked [VULN]/[HIDDEN].
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { cartRoutes } from './routes/cart.js';
import { reviewRoutes } from './routes/reviews.js';
import { walletRoutes } from './routes/wallet.js';
import { shopRoutes } from './routes/shop.js';
import { profileExtraRoutes } from './routes/profile-extra.js';
import { depositRoutes } from './routes/deposit.js';
import { labRoutes } from './lab/index.js';

const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

// Buffer any non-JSON body (needed by the file-upload lab).
app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

async function build() {
  // CORS: single configured origin + credentials (fixes the invalid "*"+credentials combo).
  await app.register(cors, {
    origin: config.frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy' };
  });

  // Secure core
  await app.register(authRoutes);
  await app.register(catalogRoutes);
  await app.register(cartRoutes);
  await app.register(reviewRoutes);
  await app.register(walletRoutes);
  await app.register(shopRoutes);
  await app.register(profileExtraRoutes);
  await app.register(depositRoutes);

  // Intentionally vulnerable lab endpoints
  await app.register(labRoutes);

  return app;
}

async function main() {
  await build();
  await prisma.$connect();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Monkstore lab backend on :${config.port} (${config.nodeEnv})`);
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
