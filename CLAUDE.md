# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Monkstore is an NFT marketplace being transformed into an **intentionally vulnerable web application** for personal security testing and learning (similar to DVWA/OWASP Juice Shop). All vulnerability additions should fit naturally into the existing routes and features, and must be documented in `VULNERABILITIES.md`.

## Running the App

```bash
# Start all services
docker compose up --build

# App available at http://localhost:8080
# Backend API directly at http://localhost:3000
# PostgreSQL directly at localhost:5432

# Rebuild a single service after changes
docker compose up --build backend

# View logs
docker compose logs -f backend

# Reset the database (wipes all data)
docker compose down -v && docker compose up --build
```

There are no tests and no linter configured.

## Architecture

Four Docker services orchestrated by `docker-compose.yml`:

- **nginx** (`:8080`) — reverse proxy; routes `/api/*` to the backend, everything else to the frontend
- **frontend** — static nginx serving HTML/CSS/JS from `./frontend/`; scaled to 3 instances
- **backend** — Node.js 20 with **zero npm dependencies**; runs `backend/server.js` directly via `node server.js`
- **db** — PostgreSQL; schema in `postgresql/db.sql`, seed data in `postgresql/data.sql`

### Backend internals (`backend/server.js`)

The entire API is a single file with manual `if` blocks matching `pathname`. Key architectural quirk: **SQL is not executed via a database driver**. Instead, every query shells out to `psql` via `child_process.exec`:

```js
exec(`psql "${DATABASE_URL}" -t -A -F '' -c '${escapedSQL}'`, callback)
```

This means SQL injection can also become command injection depending on how shell escaping is handled. New routes follow the same pattern: read body → build SQL string → call `runQuery` → parse JSON result → `respond()`.

Auth uses a custom JWT implementation (no library): `generateToken` / `verifyToken` in `server.js`, tokens stored in `localStorage` on the client. There is no role/admin column in the `profile` table yet.

### Frontend internals

Vanilla ES6 modules. `frontend/js/api.js` is the central HTTP client; all other JS files import from it. Auth state is kept in `localStorage` (`authToken`, `user`). Pages: `index.html`, `shop.html`, `cart.html`, `profile.html`, `login.html`, `nft.html`.

### Database schema

| Table | Key columns |
|---|---|
| `profile` | `id` (UUID), `username`, `email`, `password` (SHA-256+salt), `joined_at` |
| `monkeys` | `id` (TEXT, e.g. `monk-001`), `name`, `image_url`, `rarity`, `price` |
| `monkey_traits` | `monkey_id` (FK), `background`, `fur`, `headgear`, `prop` |
| `shoppingcart` | `profile_id` (FK), `monkey_id` (FK), `quantity` |

### Credentials & config (`.env`)

```
DATABASE_URL=postgresql://admin:NYadmin!@db:5432/monkeymint
JWT_SECRET=044c01014b55d5f8989d7ffb8520dad5331cea9e44f04806f084ea1c7c1a6e2a
```

## Intentional Vulnerabilities (summary)

All vulnerabilities are documented with exploitation hints in `VULNERABILITIES.md`.

| Endpoint | Vulnerability |
|---|---|
| `GET /api/search?q=` | SQL Injection (direct concatenation) |
| `GET /api/ping?host=` | Command Injection (`exec` with raw input) |
| `GET /api/user?id=` | IDOR (no auth, returns password hash) |
| `GET /api/admin/users` | Broken Access Control (`X-Admin: true` header bypass) |
| `GET /api/file?name=` | LFI / Path Traversal |
| `POST /api/upload` | Unrestricted File Upload (no MIME/ext check) |
| `GET /api/debug` | Sensitive Data Exposure (JWT_SECRET, DB creds) |
| `GET /api/session` | Insecure Deserialization (unsigned base64 cookie) |
| `POST /api/reviews` → `/nft.html` | Stored XSS (innerHTML rendering) |
| Shop search box | Reflected XSS (`displayNFTs()` in `main.js`) |

The `reviews` table is auto-created at startup via `server.listen` callback. The warning banner (`.vuln-banner` CSS class, red sticky bar) is present on every page.

## Vulnerability Development Guidelines

- Every new vulnerability must be documented in `VULNERABILITIES.md`.
- The `runQuery` shell-out architecture means some SQL injection payloads can also break shell context — document this in any new SQLi additions.
- The `is_admin` column does not exist in `profile` yet — adding it is the natural hook for future role-based access control scenarios.
