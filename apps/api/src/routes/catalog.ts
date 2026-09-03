// Catalog routes: list monkeys (with filters/sort) + fetch by id.
// Secure core: all queries are parameterized through Prisma.
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type NftWithTraits = Prisma.NftGetPayload<{ include: { traits: true } }>;

function serialize(n: NftWithTraits) {
  return {
    id: n.id,
    name: n.name,
    image: n.imageUrl,
    rarity: n.rarity,
    price: n.price,
    traits: n.traits
      ? {
          background: n.traits.background,
          fur: n.traits.fur,
          headgear: n.traits.headgear,
          prop: n.traits.prop,
        }
      : null,
  };
}

const RARITY_ORDER: Record<string, number> = {
  Common: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
  Mythic: 5,
};

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/api/monkeys', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where: Prisma.NftWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    if (q.rarity) where.rarity = q.rarity;
    if (q.maxPrice) {
      const max = parseInt(q.maxPrice, 10);
      if (!Number.isNaN(max)) where.price = { lte: max };
    }

    let orderBy: Prisma.NftOrderByWithRelationInput = { id: 'asc' };
    if (q.sortBy === 'price-asc') orderBy = { price: 'asc' };
    else if (q.sortBy === 'price-desc') orderBy = { price: 'desc' };

    const rows = await prisma.nft.findMany({ where, orderBy, include: { traits: true } });
    let result = rows.map(serialize);

    // Rarity sort needs custom ordering; done in-memory to keep it simple.
    if (q.sortBy === 'rarity-asc')
      result = result.sort(
        (a, b) => (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99),
      );
    else if (q.sortBy === 'rarity-desc')
      result = result.sort(
        (a, b) => (RARITY_ORDER[b.rarity] ?? 99) - (RARITY_ORDER[a.rarity] ?? 99),
      );

    return result;
  });

  app.get('/api/monkeys/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^monk-\d{3}$/.test(id)) return reply.code(400).send({ error: 'invalid_id' });
    const n = await prisma.nft.findUnique({ where: { id }, include: { traits: true } });
    if (!n) return reply.code(404).send({ error: 'not_found' });
    return serialize(n);
  });
}
