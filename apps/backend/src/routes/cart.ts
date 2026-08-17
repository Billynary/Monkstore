// Cart routes (authenticated). Secure core: Prisma + ownership scoped to the caller.
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth, currentUser } from '../lib/auth.js';

export async function cartRoutes(app: FastifyInstance) {
  app.get('/api/cart', { preHandler: requireAuth }, async (req) => {
    const { userId } = currentUser(req)!;
    const items = await prisma.cartItem.findMany({
      where: { userId },
      include: { nft: true },
      orderBy: { addedAt: 'asc' },
    });
    return items.map((c) => ({
      id: c.nft.id,
      name: c.nft.name,
      image: c.nft.imageUrl,
      price: c.nft.price,
      quantity: c.quantity,
    }));
  });

  app.post('/api/cart', { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = currentUser(req)!;
    const { nftId } = (req.body ?? {}) as { nftId?: string };
    if (!nftId || !/^monk-\d{3}$/.test(nftId)) return reply.code(400).send({ error: 'invalid_nftId' });

    const nft = await prisma.nft.findUnique({ where: { id: nftId } });
    if (!nft) return reply.code(404).send({ error: 'not_found' });

    await prisma.cartItem.upsert({
      where: { userId_nftId: { userId, nftId } },
      update: { quantity: { increment: 1 } },
      create: { userId, nftId, quantity: 1 },
    });
    return reply.code(201).send({ ok: true });
  });

  app.delete('/api/cart/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = currentUser(req)!;
    const { id } = req.params as { id: string };
    if (!/^monk-\d{3}$/.test(id)) return reply.code(400).send({ error: 'invalid_id' });
    await prisma.cartItem.deleteMany({ where: { userId, nftId: id } });
    return reply.code(204).send();
  });
}
