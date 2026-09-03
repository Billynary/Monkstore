// Review routes. Content is stored verbatim; the stored-XSS lab lives in the
// frontend, which renders review content via innerHTML (see VULNERABILITIES.md #8).
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { currentUser } from '../lib/auth.js';

export async function reviewRoutes(app: FastifyInstance) {
  app.get('/api/reviews', async (req) => {
    const { nftId } = req.query as { nftId?: string };
    if (!nftId) return [];
    return prisma.review.findMany({
      where: { nftId },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/api/reviews', async (req, reply) => {
    const { nftId, content, author } = (req.body ?? {}) as {
      nftId?: string;
      content?: string;
      author?: string;
    };
    if (!nftId || !content) return reply.code(400).send({ error: 'missing_fields' });

    const nft = await prisma.nft.findUnique({ where: { id: nftId } });
    if (!nft) return reply.code(404).send({ error: 'not_found' });

    const payload = currentUser(req);
    const finalAuthor =
      author || (payload ? `user_${payload.userId.substring(0, 8)}` : 'anonymous');

    // [VULN: Stored XSS] content persisted as-is; frontend renders it unsanitized.
    await prisma.review.create({ data: { nftId, author: finalAuthor, content } });
    return reply.code(201).send({ ok: true });
  });
}
