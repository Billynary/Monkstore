// ============================================================================
//  LAB MODULE — intentionally vulnerable endpoints for security training.
//  Every handler here is deliberately insecure. See VULNERABILITIES.md.
//  This module is isolated on purpose; do not import it into secure-core code.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { verifyToken, getBearer } from '../lib/auth.js';

const execAsync = promisify(exec);
const APP_ROOT = '/app';
const UPLOAD_DIR = '/app/uploads';

export async function labRoutes(app: FastifyInstance) {
  // 1) SQL Injection — raw string concatenation into an unsafe query.
  app.get('/api/search', async (req, reply) => {
    const q = (req.query as { q?: string }).q ?? '';
    const sql = `SELECT id, name, rarity, price FROM nfts WHERE name LIKE '%${q}%'`;
    try {
      const rows = await prisma.$queryRawUnsafe(sql);
      return rows;
    } catch (e: unknown) {
      // Verbose error also leaks the query (misconfiguration lab).
      return reply
        .code(500)
        .send({ error: e instanceof Error ? e.message : String(e), query: sql });
    }
  });

  // 2) Command Injection — user input concatenated into a shell command.
  app.get('/api/ping', async (req, reply) => {
    const host = (req.query as { host?: string }).host ?? 'localhost';
    try {
      const { stdout, stderr } = await execAsync(`ping -c 2 ${host}`);
      return { output: stdout + stderr };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return reply.send({ output: (err.stdout ?? '') + (err.stderr ?? ''), error: err.message });
    }
  });

  // 3) IDOR — no auth; returns the password hash for any user id. Also SQL-injectable.
  app.get('/api/user', async (req, reply) => {
    const id = (req.query as { id?: string }).id;
    if (!id) return reply.code(400).send({ error: 'missing_id' });
    const sql = `SELECT id, username, email, password_hash, created_at FROM users WHERE id::text = '${id}'`;
    try {
      const rows = (await prisma.$queryRawUnsafe(sql)) as unknown[];
      if (!rows.length) return reply.code(404).send({ error: 'not_found' });
      return rows[0];
    } catch (e: unknown) {
      return reply.code(500).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 4) Broken Access Control — trivial header bypass.
  app.get('/api/admin/users', async (req, reply) => {
    if (req.headers['x-admin'] !== 'true') {
      return reply.code(403).send({ error: 'not_admin', hint: 'Add X-Admin: true header' });
    }
    return prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
        isAdmin: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  // 5) Local File Inclusion / Path Traversal.
  app.get('/api/file', async (req, reply) => {
    const name = (req.query as { name?: string }).name ?? 'package.json';
    const filePath = path.join(APP_ROOT, name);
    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      return { content: data, path: filePath };
    } catch (e: unknown) {
      return reply
        .code(500)
        .send({ error: e instanceof Error ? e.message : String(e), attempted_path: filePath });
    }
  });

  // 6) Unrestricted File Upload (no MIME/ext check; filename from header).
  app.post('/api/upload', async (req, reply) => {
    const filename = (req.headers['x-filename'] as string) || `upload_${Date.now()}.bin`;
    const uploadPath = path.join(UPLOAD_DIR, filename);
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    const body = req.body as Buffer | undefined;
    await fs.promises.writeFile(
      uploadPath,
      Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? '')),
    );
    return { saved: uploadPath, url: `/api/uploads/${filename}` };
  });

  app.get('/api/uploads/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const filePath = path.join(UPLOAD_DIR, file);
    try {
      const data = await fs.promises.readFile(filePath);
      return reply.type('text/plain').send(data);
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });

  // 9) Sensitive Data Exposure. (Stripe keys are deliberately NOT included.)
  app.get('/api/debug', async () => {
    const dbUrl = config.databaseUrl;
    let dbCreds: Record<string, string> = {};
    try {
      const u = new URL(dbUrl);
      dbCreds = {
        user: u.username,
        password: u.password,
        host: u.hostname,
        db: u.pathname.replace('/', ''),
      };
    } catch {
      /* ignore */
    }
    return {
      mode: 'debug_enabled',
      env: {
        DATABASE_URL: dbUrl,
        JWT_SECRET: config.jwtSecret,
        PORT: config.port,
        FRONTEND_ORIGIN: config.frontendOrigin,
      },
      db_credentials: dbCreds,
      uptime_seconds: process.uptime(),
      node_version: process.version,
    };
  });

  // 10) Insecure Deserialization — unsigned base64 session cookie.
  app.get('/api/session', async (req, reply) => {
    const cookieHeader = req.headers['cookie'] ?? '';
    const sessionRaw = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('session='));

    if (sessionRaw) {
      try {
        const sessionData = JSON.parse(Buffer.from(sessionRaw.split('=')[1], 'base64').toString());
        return { session: sessionData, isAdmin: sessionData.isAdmin === true };
      } catch (e: unknown) {
        return reply
          .code(400)
          .send({ error: 'invalid_session', detail: e instanceof Error ? e.message : String(e) });
      }
    }

    const payload = verifyToken(getBearer(req));
    const session = { userId: payload?.userId ?? 'anonymous', isAdmin: false, ts: Date.now() };
    const encoded = Buffer.from(JSON.stringify(session)).toString('base64');
    reply.header('set-cookie', `session=${encoded}; Path=/`);
    return {
      session,
      cookie: encoded,
      hint: 'Decode, set isAdmin:true, re-encode, resend as session= cookie',
    };
  });
}
