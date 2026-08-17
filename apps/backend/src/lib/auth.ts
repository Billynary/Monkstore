// Authentication core: password hashing (argon2id) + custom HS256 JWTs.
import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

export interface JwtPayload {
  userId: string;
  exp: number;
  iat: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

// ---- Passwords (secure core) ----
export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, {
    // argon2id defaults; parameters chosen for interactive login.
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hashStr, password);
  } catch {
    return false;
  }
}

// ---- JWT (HS256, self-implemented) ----
export function signToken(userId: string, ttlSeconds = 60 * 60 * 24 * 7): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ userId, iat: now, exp: now + ttlSeconds }));
  const signature = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string | undefined | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expected = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (signature !== expected) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as JwtPayload;
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getBearer(req: FastifyRequest): string | null {
  const auth = req.headers['authorization'];
  if (!auth) return null;
  const [scheme, value] = auth.split(' ');
  if (scheme !== 'Bearer' || !value) return null;
  return value;
}

// Fastify preHandler: require a valid token, attach req.user.
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const payload = verifyToken(getBearer(req));
  if (!payload) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  (req as FastifyRequest & { user: JwtPayload }).user = payload;
}

export function currentUser(req: FastifyRequest): JwtPayload | null {
  return (req as FastifyRequest & { user?: JwtPayload }).user ?? verifyToken(getBearer(req));
}
