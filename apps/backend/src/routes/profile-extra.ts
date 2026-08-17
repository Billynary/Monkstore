// Extra profile routes.
// Hidden training vulnerabilities (documented only in SOLUTIONS.md):
//   [HIDDEN] Prototype pollution via a naive recursive merge of user-supplied JSON.
//   [HIDDEN] SSRF via server-side fetch of a user-supplied avatar URL (no allowlist).
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/auth.js';

// Naive recursive merge — walks into __proto__/constructor, enabling prototype pollution.
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
      deepMerge(target[key] as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      target[key] = val;
    }
  }
  return target;
}

// Per-process settings object that the merge writes into.
const defaultPreferences: Record<string, unknown> = { theme: 'dark', currency: 'tokens' };

export async function profileExtraRoutes(app: FastifyInstance) {
  app.post('/api/profile/preferences', { preHandler: requireAuth }, async (req, reply) => {
    // Parse the body ourselves so unusual content types are accepted. This also
    // sidesteps Fastify's hardened JSON parser (which rejects __proto__ keys).
    let body: Record<string, unknown>;
    try {
      const raw = Buffer.isBuffer(req.body)
        ? req.body.toString()
        : typeof req.body === 'string'
          ? req.body
          : null;
      body =
        raw !== null
          ? (JSON.parse(raw || '{}') as Record<string, unknown>)
          : ((req.body ?? {}) as Record<string, unknown>);
    } catch {
      return reply.code(400).send({ error: 'invalid_json' });
    }
    // [HIDDEN] merges attacker-controlled keys (e.g. "__proto__") into an object.
    const merged = deepMerge({ ...defaultPreferences }, body);
    // Gadget: later logic reads an option from a fresh object, which now inherits
    // any polluted property from Object.prototype.
    const probe = {} as Record<string, unknown>;
    return { ok: true, preferences: merged, adminMode: probe.isAdmin === true };
  });

  app.post('/api/profile/avatar', { preHandler: requireAuth }, async (req, reply) => {
    const { url } = (req.body ?? {}) as { url?: string };
    if (!url) return reply.code(400).send({ error: 'missing_url' });
    try {
      // [HIDDEN: SSRF] fetches an arbitrary user-supplied URL server-side.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const text = await res.text();
      return {
        ok: true,
        status: res.status,
        contentType: res.headers.get('content-type'),
        length: text.length,
        preview: text.slice(0, 512),
      };
    } catch (e: unknown) {
      return reply.code(502).send({ error: 'fetch_failed', detail: e instanceof Error ? e.message : String(e) });
    }
  });
}
