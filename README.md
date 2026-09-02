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
- **Deploy:** **Docker Compose**, the same `docker-compose.yml` everywhere — on a
  laptop and on a plain Docker host / LXC in the homelab.

## Layout

```
apps/backend      Fastify + Prisma API (secure core in src/routes, lab vulns in src/lab)
apps/frontend     Vite + TS SPA (nginx serves it and proxies /api)
docker-compose.yml    the single deployment unit — tracked in git on purpose
.env / .env.example
VULNERABILITIES.md    documented (known) vulns
SOLUTIONS.md          sealed hidden-vuln answer key (gitignored, not in images)
```

## Run it (Docker Compose)

```bash
cp .env.example .env        # then edit values (a dev .env is already present)
docker compose up -d --build
#   web  http://localhost:8081
#   api  http://localhost:3000
#   db   localhost:5432
```

The `seed` service applies Prisma migrations and seeds the catalog on every
`up`, then exits. It is idempotent, so the stack provisions itself on a fresh
host with no follow-up commands. To run it by hand anyway:

```bash
docker compose run --rm backend npx prisma migrate deploy
docker compose run --rm backend npm run seed
```

Reset everything: `docker compose down -v && docker compose up -d --build`.

### Ports

`WEB_PORT`, `BACKEND_PORT` and `DB_PORT` in `.env` decide what is published on
the host. Local defaults are 8081 / 3000 / 5432 (8080 is taken by another
project on the dev machine). The homelab host sets `WEB_PORT=80` and lets
Traefik terminate TLS in front of it.

## Deployment in the homelab

The host does not pull a pre-built image from a registry — **it clones this
repository and builds locally**:

```
git clone https://github.com/Billynary/Monkstore.git /opt/docker/monkstore
# .env is rendered from Ansible Vault, then:
docker compose up -d --build
```

That is why `docker-compose.yml` and the Dockerfiles are version-controlled.
The Ansible role is `roles/home-monkstore` in the private `Linux-Automation`
repo; it runs on `home-monkstore` (an LXC with Docker, `192.168.0.101`).

There is no Kubernetes any more. The k3s VM was dropped because the Proxmox API
token available here cannot create VMs, and a single-node cluster bought nothing
over Compose for a four-container stack.

## Secrets

- `.env` and all `*.sql` **data** files are gitignored. Prisma **migrations**
  (`apps/backend/prisma/migrations/**/*.sql`) are intentionally tracked (schema DDL,
  no secrets). Anything matching `*secret*` is gitignored.
- DB creds, `JWT_SECRET`, and Stripe test keys come from `.env` — never hardcoded.
  On the homelab host that `.env` is rendered from Ansible Vault, mode `0600`.

---

**Built as a security playground. Break responsibly. 🐒**
