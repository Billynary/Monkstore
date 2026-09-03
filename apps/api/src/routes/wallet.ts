// Wallet routes.
// [VULN: IDOR] GET /api/wallet?userId= returns any user's balance (no ownership check).
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth, currentUser } from '../lib/auth.js';

export async function walletRoutes(app: FastifyInstance) {
  app.get('/api/wallet', { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = currentUser(req)!;
    const q = req.query as { userId?: string };
    // [VULN: IDOR] target defaults to the caller, but any userId is accepted.
    const targetId = q.userId || userId;
    const wallet = await prisma.wallet.findUnique({ where: { userId: targetId } });
    if (!wallet) return reply.code(404).send({ error: 'wallet_not_found' });
    return { userId: targetId, balance: wallet.balance };
  });
}
