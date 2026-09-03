// Auth routes: register, login, profile.
// Secure core: argon2id password hashing + signed JWTs.
// [VULN: Mass Assignment] register trusts is_admin / balance from the request body.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, signToken, requireAuth, currentUser } from '../lib/auth.js';

const STARTING_BALANCE = 1000;

const registerSchema = z.object({
  username: z.string().min(1).max(64),
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'missing_fields' });
    const { username, email, password } = parsed.data;

    // [VULN: Mass Assignment] extra fields from the body are honored verbatim.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const isAdmin = body.isAdmin === true || body.is_admin === true;
    const balance =
      typeof body.balance === 'number' && Number.isFinite(body.balance)
        ? Math.trunc(body.balance)
        : STARTING_BALANCE;

    try {
      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          isAdmin,
          wallet: { create: { balance } },
        },
        select: { id: true, username: true, email: true, isAdmin: true },
      });
      const token = signToken(user.id);
      return reply.code(201).send({ user, token });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Unique constraint')) return reply.code(409).send({ error: 'user_exists' });
      return reply.code(500).send({ error: 'db_error' });
    }
  });

  app.post('/api/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'missing_credentials' });
    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { username } });
    // Uniform failure response (no user enumeration on login).
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const token = signToken(user.id);
    return reply.send({
      user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin },
      token,
    });
  });

  app.get('/api/profile', { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = currentUser(req)!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, isAdmin: true, createdAt: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send({ user });
  });
}
