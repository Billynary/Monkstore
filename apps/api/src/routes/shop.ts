// Shop routes: purchase, inventory, transaction history, promo redemption.
//
// Intentional training vulnerabilities in this file (see VULNERABILITIES.md):
//   [VULN A] Price manipulation — POST /api/purchase trusts a client-supplied price.
//   [VULN B] Race condition (TOCTOU) — balance is checked, then debited across an await gap.
//   [VULN D] Negative amounts — no positivity check, so a negative price/qty credits the wallet.
// Hidden training vulnerabilities (documented only in SOLUTIONS.md):
//   [HIDDEN] IDOR on inventory/transactions via ?userId=.
//   [HIDDEN] Reusable promo code (not tracked per user).
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth, currentUser } from '../lib/auth.js';
import { sleep } from '../lib/util.js';

// Promo codes → token grant. (No per-user redemption tracking — intentional.)
const PROMO_CODES: Record<string, number> = {
  WELCOME: 500,
  MONK100: 100,
};

export async function shopRoutes(app: FastifyInstance) {
  app.post('/api/purchase', { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = currentUser(req)!;
    const body = (req.body ?? {}) as { nftId?: string; price?: number; quantity?: number };
    if (!body.nftId) return reply.code(400).send({ error: 'missing_nftId' });

    const nft = await prisma.nft.findUnique({ where: { id: body.nftId } });
    if (!nft) return reply.code(404).send({ error: 'not_found' });

    const quantity = typeof body.quantity === 'number' ? body.quantity : 1;
    // [VULN A] client may override the price; [VULN D] no positivity checks on price/qty.
    const unitPrice = typeof body.price === 'number' ? body.price : nft.price;
    const cost = unitPrice * quantity;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return reply.code(404).send({ error: 'wallet_not_found' });

    // [VULN B] check-then-act with a widened race window (non-atomic).
    if (wallet.balance < cost) return reply.code(402).send({ error: 'insufficient_funds' });
    await sleep(75);

    const tx = await prisma.transaction.create({
      data: { userId, type: 'PURCHASE', amount: -cost, nftId: nft.id, status: 'COMPLETED' },
    });
    await prisma.wallet.update({ where: { userId }, data: { balance: { decrement: cost } } });
    const ownerships = [];
    for (let i = 0; i < Math.max(1, Math.trunc(quantity)); i++) {
      ownerships.push(
        await prisma.ownership.create({ data: { userId, nftId: nft.id, transactionId: tx.id } }),
      );
    }

    const updated = await prisma.wallet.findUnique({ where: { userId } });
    return reply.code(201).send({ ok: true, balance: updated?.balance, owned: ownerships.length });
  });

  app.get('/api/inventory', { preHandler: requireAuth }, async (req) => {
    const { userId } = currentUser(req)!;
    const q = req.query as { userId?: string };
    // [HIDDEN: IDOR] any userId is honored.
    const targetId = q.userId || userId;
    const owned = await prisma.ownership.findMany({
      where: { userId: targetId },
      include: { nft: { include: { traits: true } } },
      orderBy: { acquiredAt: 'desc' },
    });
    return owned.map((o) => ({
      ownershipId: o.id,
      id: o.nft.id,
      name: o.nft.name,
      image: o.nft.imageUrl,
      rarity: o.nft.rarity,
      price: o.nft.price,
      acquiredAt: o.acquiredAt,
      traits: o.nft.traits
        ? {
            background: o.nft.traits.background,
            fur: o.nft.traits.fur,
            headgear: o.nft.traits.headgear,
            prop: o.nft.traits.prop,
          }
        : null,
    }));
  });

  app.get('/api/transactions', { preHandler: requireAuth }, async (req) => {
    const { userId } = currentUser(req)!;
    const q = req.query as { userId?: string };
    // [HIDDEN: IDOR] any userId is honored.
    const targetId = q.userId || userId;
    return prisma.transaction.findMany({
      where: { userId: targetId },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/api/promo/redeem', { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = currentUser(req)!;
    const { code } = (req.body ?? {}) as { code?: string };
    if (!code) return reply.code(400).send({ error: 'missing_code' });
    const grant = PROMO_CODES[code.toUpperCase()];
    if (!grant) return reply.code(404).send({ error: 'invalid_code' });

    // [HIDDEN] no record that this user already redeemed this code → reusable.
    await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        amount: grant,
        status: 'COMPLETED',
        reference: `promo:${code}`,
      },
    });
    const wallet = await prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: grant } },
    });
    return { ok: true, granted: grant, balance: wallet.balance };
  });
}
