# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Monkstore is an NFT marketplace that is **entirely an intentionally vulnerable web
application** for personal security testing and learning (DVWA / OWASP Juice Shop
style). New training vulnerabilities should fit naturally into the routes/features
and be documented: **known** vulns in `VULNERABILITIES.md`, **hidden** ones in the
sealed `SOLUTIONS.md` (gitignored, never baked into images).

The app must never be exposed publicly. Stripe is TEST mode only.

## Running the App (Docker Compose)

```bash
docker compose up -d --build       # web :8081, backend API :3000, postgres :5432
docker compose down -v && docker compose up -d --build      # full reset
```

The one-shot `seed` service runs `prisma migrate deploy` + `npm run seed` on
every `up` and exits, so the stack provisions itself. To do it by hand:

```bash
docker compose run --rm backend npx prisma migrate deploy
docker compose run --rm backend npm run seed
```

Published ports come from `WEB_PORT` / `BACKEND_PORT` / `DB_PORT` in `.env`
(defaults 8081 / 3000 / 5432). There are no tests. Type-checking happens at
build time (`tsc` / `vite build`).

## Architecture

Monorepo under `apps/`, orchestrated by `docker-compose.yml`:

- **db** — dedicated PostgreSQL 16. Schema is managed by **Prisma migrations**
  (`apps/backend/prisma/migrations`), not raw SQL files.
- **backend** (`apps/backend`, `:3000`) — **TypeScript + Fastify + Prisma**. Entry
  `src/server.ts`. Secure-core routes in `src/routes/*`; the classic lab vulns are
  isolated in `src/lab/index.ts`. Passwords use **argon2id** (`@node-rs/argon2`);
  custom HS256 JWTs in `src/lib/auth.ts`. Input validation via **Zod**.
- **web** (`apps/frontend`, `:8081`) — **Vite + TypeScript** SPA built to static
  files and served by nginx, which also reverse-proxies `/api` → `backend:3000`
  (`apps/frontend/nginx.conf`). This single service replaces the old separate
  nginx + frontend containers.

There is exactly ONE deployment unit: `docker-compose.yml`. The same file runs
locally and on the homelab host, which is a plain Docker host (LXC), not a
Kubernetes node. Anything host-specific is an environment variable with a
local-dev default, so no second compose file exists to drift.

### Data access

All secure-core queries go through **Prisma** (parameterized). SQL-injection labs
deliberately use `prisma.$queryRawUnsafe` inside `src/lab/`. There is no more
`psql` shell-out.

### Database schema (Prisma models → tables)

`users` (+`is_admin`), `wallets` (token balance), `nfts` + `nft_traits`,
`ownerships` (inventory), `cart_items`, `transactions`, `deposits`, `reviews`.
Prices are denominated in in-app **tokens**. New users start with 1000 tokens.

### Frontend

Vite multi-page app. `src/api.ts` is the typed HTTP client; each page has its own
`src/*.ts` entry. Auth state in `localStorage` (`authToken`, `user`). Pages:
`index`, `shop`, `cart`, `profile`, `login`, `nft`, `admin`.

## Intentional Vulnerabilities

The **known** set (11 classic + 4 shop/currency) is documented with exploitation
hints in `VULNERABILITIES.md`. **Hidden** challenges (IDOR, prototype pollution,
SSRF, reusable promo, DOM XSS, source-map leak, timing-unsafe JWT compare) are in
`SOLUTIONS.md`. Every page carries the red `.vuln-banner`.

## Development Guidelines

- New **known** vuln → document in `VULNERABILITIES.md`. New **hidden** vuln →
  document only in `SOLUTIONS.md` (which is gitignored and not copied into images).
- Keep the secure core genuinely secure (argon2, parameterized Prisma queries,
  verified JWTs). Intentional weaknesses are marked `[VULN]` / `[HIDDEN]` in code.
- `/api/debug` must NOT expose Stripe keys (only DB creds + `JWT_SECRET`).

## Deployment

Hosts get the code by **cloning this repository from GitHub and building
locally** (`git clone` -> render `.env` -> `docker compose up -d --build`), not
by pulling images from a registry. Consequence: `docker-compose.yml`, the
Dockerfiles and the `.dockerignore` files MUST stay version-controlled. Do not
re-add them to `.gitignore`.

The homelab side lives in the private `Linux-Automation` repo:
`ansible/roles/home-monkstore` (service) plus the shared `app_source` role (the
git checkout). Host: `home-monkstore`, an LXC with Docker at `192.168.0.101`.

## Secrets & .gitignore

- `.env` and `*.sql` **data** files are gitignored. Prisma migrations
  (`apps/backend/prisma/migrations/**/*.sql`) are explicitly re-included (schema DDL,
  no secrets). Anything matching `*secret*` is gitignored.
- All credentials (DB, `JWT_SECRET`, Stripe test keys) come from `.env` — never
  hardcoded. On the homelab host that file is rendered from Ansible Vault (0600).

## Legacy

The original top-level `backend/`, `frontend/`, `postgresql/`, `nginx/` directories
are superseded by `apps/` and can be deleted. The `k8s/` manifests are gone: the
k3s VM they targeted no longer exists.
