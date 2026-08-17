# Monkstore — Intentionally Vulnerable NFT Marketplace (Security Lab)

Monkstore is a **deliberately vulnerable** web application used as a personal
security-training environment (DVWA / OWASP Juice Shop style). It looks like a
small NFT marketplace where you buy "monkeys" with an in-app currency (Monk Tokens 🪙).

> ⚠️ **The entire app is a lab. Never expose it to a public network.**

Documented vulnerabilities live in [`VULNERABILITIES.md`](./VULNERABILITIES.md).
Additional **hidden** challenges are kept in a sealed, gitignored `SOLUTIONS.md`
that is never baked into any image.

## Tech Stack

- **Backend:** Node.js 22 + **TypeScript** + **Fastify** + **Zod**, data access via
  **Prisma** (PostgreSQL). Passwords hashed with **argon2id**; custom HS256 JWTs.
- **Frontend:** **Vite** + **TypeScript** (vanilla), served by nginx which also
  reverse-proxies `/api` to the backend.
- **Database:** dedicated **PostgreSQL** container; schema via Prisma migrations.
- **Payments:** Stripe deposit module in **TEST mode only** (with a keyless
  "simulate" fallback).
- **Deploy:** Docker Compose for local dev; **Kubernetes** manifests in [`k8s/`](./k8s).

## Layout

```
apps/backend      Fastify + Prisma API (secure core in src/routes, lab vulns in src/lab)
apps/frontend     Vite + TS SPA (nginx serves it and proxies /api)
k8s/              Kubernetes manifests (namespace monkstore-lab)
docker-compose.yml
.env / .env.example
VULNERABILITIES.md    documented (known) vulns
SOLUTIONS.md          sealed hidden-vuln answer key (gitignored, not in images)
```

## Run locally (Docker)

```bash
cp .env.example .env        # then edit values (a dev .env is already present)
docker compose up --build   # web on http://localhost:8081, API on :3000, db on :5432

# Apply migrations + seed the catalog (first run):
docker compose run --rm backend npx prisma migrate deploy
docker compose run --rm backend npm run seed
```

Reset everything: `docker compose down -v && docker compose up --build`.

## Kubernetes

See [`k8s/README.md`](./k8s/README.md). Deploy only to a private/local cluster.

## Secrets

- `.env` and all `*.sql` **data** files are gitignored. Prisma **migrations**
  (`apps/backend/prisma/migrations/**/*.sql`) are intentionally tracked (schema DDL,
  no secrets). Anything matching `*secret*` is gitignored (incl. `k8s/secret.yaml`).
- DB creds, `JWT_SECRET`, and Stripe test keys come from `.env` / K8s Secrets — never
  hardcoded.

---

**Built as a security playground. Break responsibly. 🐒**
