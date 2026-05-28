// server.js – minimalistischer Node-Backend-Server ohne npm

const http        = require('http');
const url         = require('url');
const { exec }    = require('child_process');
const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');

// ------------------------------------------------------------
// ENV
// ------------------------------------------------------------
const PORT           = process.env.PORT || 3000;
const DATABASE_URL   = process.env.DATABASE_URL;
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const JWT_SECRET     = process.env.JWT_SECRET || 'defaultsecret';

// ------------------------------------------------------------
// Hilfsfunktionen
// ------------------------------------------------------------
function escapeSQL(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toString();
  // Escape single quotes by doubling them
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runQuery(sql, cb) {
  // Escape the entire SQL command for shell
  const escapedSQL = sql.replace(/'/g, "'\\''");
  const cmd  = `psql "${DATABASE_URL}" -t -A -F '' -c '${escapedSQL}'`;
  exec(cmd, (err, out) => (err ? cb(err) : cb(null, out.trim())));
}

function respond(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': 'true'
  });
  res.end(body);
}

// Hash password using crypto
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
}

// Generate JWT token
function generateToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ 
    userId, 
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7 days
  })).toString('base64');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64');
  return `${header}.${payload}.${signature}`;
}

// Verify JWT token
function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64');
    
  if (signature !== parts[2]) return null;
  
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Extract auth token from headers
function getAuthToken(req) {
  const auth = req.headers['authorization'];
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

// ------------------------------------------------------------
// HTTP-Server
// ------------------------------------------------------------
const server = http.createServer((req, res) => {
  // CORS-Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': 86400
    });
    return res.end();
  }

  const { pathname } = url.parse(req.url, true);

  //------------------------------------------------------------------
  // GET /health  –  Health check endpoint
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/health') {
    return respond(res, 200, { status: 'healthy' });
  }

  //------------------------------------------------------------------
  // POST /api/register  –  Register new user
  //------------------------------------------------------------------
  if (req.method === 'POST' && pathname === '/api/register') {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      let d;
      try { d = JSON.parse(raw); } catch { return respond(res, 400, { error: 'invalid_json' }); }
      
      if (!d.username || !d.email || !d.password) {
        return respond(res, 400, { error: 'missing_fields' });
      }
      
      const hashedPassword = hashPassword(d.password);
      const sql = `
        INSERT INTO profile (username, email, password)
        VALUES (${escapeSQL(d.username)}, ${escapeSQL(d.email)}, ${escapeSQL(hashedPassword)})
        RETURNING id, username, email;`;
      
      runQuery(sql, (e, result) => {
        if (e) {
          if (e.message.includes('duplicate key')) {
            return respond(res, 409, { error: 'user_exists' });
          }
          return respond(res, 500, { error: 'db_error', detail: e.message });
        }
        
        try {
          const user = JSON.parse(result);
          const token = generateToken(user.id);
          respond(res, 201, { user, token });
        } catch {
          respond(res, 500, { error: 'parse_error' });
        }
      });
    });
    return;
  }

  //------------------------------------------------------------------
  // POST /api/login  –  Login user
  //------------------------------------------------------------------
  if (req.method === 'POST' && pathname === '/api/login') {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      let d;
      try { d = JSON.parse(raw); } catch { return respond(res, 400, { error: 'invalid_json' }); }
      
      if (!d.username || !d.password) {
        return respond(res, 400, { error: 'missing_credentials' });
      }
      
      const hashedPassword = hashPassword(d.password);
      const sql = `
        SELECT row_to_json(u) FROM (
          SELECT id, username, email
          FROM profile
          WHERE username = ${escapeSQL(d.username)}
            AND password = ${escapeSQL(hashedPassword)}
        ) u;`;
      
      runQuery(sql, (e, result) => {
        if (e) return respond(res, 500, { error: 'db_error', detail: e.message });
        
        if (!result) {
          return respond(res, 401, { error: 'invalid_credentials' });
        }
        
        try {
          const user = JSON.parse(result);
          const token = generateToken(user.id);
          respond(res, 200, { user, token });
        } catch {
          respond(res, 500, { error: 'parse_error' });
        }
      });
    });
    return;
  }

  //------------------------------------------------------------------
  // GET /api/profile  –  Get current user profile
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/profile') {
    const token = getAuthToken(req);
    const payload = verifyToken(token);
    
    if (!payload) {
      return respond(res, 401, { error: 'unauthorized' });
    }
    
    const sql = `
      SELECT row_to_json(u) FROM (
        SELECT id, username, email, joined_at
        FROM profile
        WHERE id = ${escapeSQL(payload.userId)}
      ) u;`;
    
    runQuery(sql, (e, result) => {
      if (e) return respond(res, 500, { error: 'db_error', detail: e.message });
      if (!result) return respond(res, 404, { error: 'user_not_found' });
      
      try {
        const user = JSON.parse(result);
        respond(res, 200, { user });
      } catch {
        respond(res, 500, { error: 'parse_error' });
      }
    });
    return;
  }

  //------------------------------------------------------------------
  // GET /api/monkeys  –  Liste mit Traits
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/monkeys') {
  const { query } = url.parse(req.url, true);

  const filters = [];
  if (query.search) {
    filters.push(`LOWER(m.name) LIKE LOWER('%${query.search.replace(/'/g, "''")}%')`);
  }
  if (query.rarity) {
    filters.push(`m.rarity = '${query.rarity.replace(/'/g, "''")}'`);
  }
  if (query.maxPrice) {
    const price = parseInt(query.maxPrice, 10);
    if (!isNaN(price)) {
      filters.push(`m.price <= ${price}`);
    }
  }

  let orderBy = 'm.id'; // default fallback
  if (query.sortBy) {
    switch (query.sortBy) {
      case 'price-asc':
        orderBy = 'm.price ASC';
        break;
      case 'price-desc':
        orderBy = 'm.price DESC';
        break;
      case 'rarity-asc':
        orderBy = `
          CASE m.rarity
            WHEN 'Common' THEN 1
            WHEN 'Rare' THEN 2
            WHEN 'Epic' THEN 3
            WHEN 'Legendary' THEN 4
            WHEN 'Mythic' THEN 5
            ELSE 99
          END ASC`;
        break;
      case 'rarity-desc':
        orderBy = `
          CASE m.rarity
            WHEN 'Common' THEN 1
            WHEN 'Rare' THEN 2
            WHEN 'Epic' THEN 3
            WHEN 'Legendary' THEN 4
            WHEN 'Mythic' THEN 5
            ELSE 99
          END DESC`;
        break;
    }
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `
    SELECT COALESCE(JSON_AGG(row_to_json(x)), '[]'::json)
    FROM (
      SELECT m.id,
             m.name,
             m.image_url   AS image,
             m.rarity,
             (m.price) AS price,
             json_build_object(
               'background', t.background,
               'fur',        t.fur,
               'headgear',   t.headgear,
               'prop',       t.prop
             ) AS traits
      FROM monkeys m
      JOIN monkey_traits t ON t.monkey_id = m.id
      ${whereClause}
      ORDER BY ${orderBy}
    ) x;`;

  return runQuery(sql, (e, j) =>
    e ? respond(res, 500, { error: 'db_error', detail: e.message })
      : respond(res, 200, JSON.parse(j || '[]')));
}



  //------------------------------------------------------------------
  // GET /api/monkeys/:id
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname.startsWith('/api/monkeys/')) {
    const id  = pathname.split('/').pop();
    // Validate ID is numeric
    if (!/^monk-\d{3}$/.test(id)) {
  return respond(res, 400, { error: 'invalid_id' });
}

    
    const sql = `
      SELECT row_to_json(x) FROM (
        SELECT m.id,
               m.name,
               m.image_url   AS image,
               m.rarity,
               (m.price) AS price,
               json_build_object(
                 'background', t.background,
                 'fur',        t.fur,
                 'headgear',   t.headgear,
                 'prop',       t.prop
               ) AS traits
        FROM monkeys m
        JOIN monkey_traits t ON t.monkey_id = m.id
        WHERE m.id = ${escapeSQL(id)}
      ) x;`;
    return runQuery(sql, (e, j) =>
      e ? respond(res, 500, { error: 'db_error', detail: e.message })
        : j ? respond(res, 200, JSON.parse(j))
            : respond(res, 404, { error: 'not_found' })
    );
  }

  //------------------------------------------------------------------
  // GET /api/cart  –  Warenkorb (Authenticated User)
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/cart') {
    const token = getAuthToken(req);
    const payload = verifyToken(token);
    
    if (!payload) {
      return respond(res, 401, { error: 'unauthorized' });
    }
    
    const sql = `
      SELECT COALESCE(JSON_AGG(row_to_json(x)), '[]'::json)
      FROM (
        SELECT m.id,
               m.name,
               m.image_url   AS image,
               (m.price) AS price,
               c.quantity
        FROM shoppingcart c
        JOIN monkeys m ON m.id = c.monkey_id
        WHERE c.profile_id = ${escapeSQL(payload.userId)}
      ) x;`;
    return runQuery(sql, (e, j) =>
      e ? respond(res, 500, { error: 'db_error', detail: e.message })
        : respond(res, 200, JSON.parse(j || '[]')));
  }

  //------------------------------------------------------------------
  // POST /api/cart   { nftId }
  //------------------------------------------------------------------
  if (req.method === 'POST' && pathname === '/api/cart') {
    const token = getAuthToken(req);
    const payload = verifyToken(token);
    
    if (!payload) {
      return respond(res, 401, { error: 'unauthorized' });
    }
    
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      let d;
      try { d = JSON.parse(raw); } catch { return respond(res, 400, { error: 'invalid_json' }); }
      if (!d.nftId) return respond(res, 400, { error: 'missing_nftId' });
      
      // Validate nftId format (monk-XXXX)
      if (!/^monk-\d{3}$/.test(d.nftId)) {
        return respond(res, 400, { error: 'invalid_nftId' });
      }

      const sql = `
        INSERT INTO shoppingcart (profile_id, monkey_id, quantity)
        VALUES (${escapeSQL(payload.userId)}, ${escapeSQL(d.nftId)}, 1)
        ON CONFLICT (profile_id, monkey_id)
          DO UPDATE SET quantity = shoppingcart.quantity + 1;`;
      runQuery(sql, e =>
        e ? respond(res, 500, { error: 'db_error', detail: e.message })
          : respond(res, 201, { ok: true }));
    });
    return;
  }

  //------------------------------------------------------------------
  // DELETE /api/cart/:id
  //------------------------------------------------------------------
  if (req.method === 'DELETE' && pathname.startsWith('/api/cart/')) {
    const token = getAuthToken(req);
    const payload = verifyToken(token);
    
    if (!payload) {
      return respond(res, 401, { error: 'unauthorized' });
    }
    
    const id = pathname.split('/').pop();
    // Validate ID is numeric
    if (!/^monk-\d{3}$/.test(id)) {
      return respond(res, 400, { error: 'invalid_id' });
    }
    
    const sql = `
      DELETE FROM shoppingcart
      WHERE profile_id = ${escapeSQL(payload.userId)} AND monkey_id = ${escapeSQL(id)};`;
    return runQuery(sql, e =>
      e ? respond(res, 500, { error: 'db_error', detail: e.message })
        : respond(res, 204, {}));
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/search?q=X  –  SQL Injection (direct concatenation)
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/search') {
    const { query } = url.parse(req.url, true);
    const q = query.q || '';
    // VULN: user input concatenated directly into SQL – try: ' OR '1'='1
    const sql = `SELECT COALESCE(JSON_AGG(row_to_json(x)), '[]'::json) FROM (SELECT id, name, rarity, price FROM monkeys WHERE name LIKE '%${q}%') x;`;
    return runQuery(sql, (e, j) =>
      e ? respond(res, 500, { error: e.message, query: sql })
        : respond(res, 200, JSON.parse(j || '[]'))
    );
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/ping?host=X  –  Command Injection
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/ping') {
    const { query } = url.parse(req.url, true);
    const host = query.host || 'localhost';
    // VULN: host appended directly to shell command – try: 127.0.0.1; id
    exec(`ping -c 2 ${host}`, (err, stdout, stderr) => {
      respond(res, 200, { output: stdout + stderr, error: err?.message });
    });
    return;
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/user?id=X  –  IDOR (no authentication required)
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/user') {
    const { query } = url.parse(req.url, true);
    const id = query.id;
    if (!id) return respond(res, 400, { error: 'missing_id' });
    // VULN: no auth check – any id returns full profile including password hash
    const sql = `SELECT row_to_json(u) FROM (SELECT id, username, email, password, joined_at FROM profile WHERE id = ${escapeSQL(id)}) u;`;
    return runQuery(sql, (e, j) =>
      e ? respond(res, 500, { error: e.message })
        : j ? respond(res, 200, JSON.parse(j))
            : respond(res, 404, { error: 'not_found' })
    );
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/admin/users  –  Broken Access Control (trivial header bypass)
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/admin/users') {
    // VULN: "auth" is a single header check – add X-Admin: true to bypass
    if (req.headers['x-admin'] !== 'true') {
      return respond(res, 403, { error: 'not_admin', hint: 'Add X-Admin: true header' });
    }
    const sql = `SELECT COALESCE(JSON_AGG(row_to_json(u)), '[]'::json) FROM (SELECT id, username, email, password, joined_at FROM profile ORDER BY joined_at) u;`;
    return runQuery(sql, (e, j) =>
      e ? respond(res, 500, { error: e.message })
        : respond(res, 200, JSON.parse(j || '[]'))
    );
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/file?name=X  –  Local File Inclusion / Path Traversal
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/file') {
    const { query } = url.parse(req.url, true);
    const name = query.name || 'server.js';
    // VULN: path.join does not prevent traversal with absolute paths on some inputs
    // try: ?name=../../../etc/passwd or ?name=/etc/passwd
    const filePath = path.join('/usr/src/app', name);
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return respond(res, 500, { error: err.message, attempted_path: filePath });
      respond(res, 200, { content: data, path: filePath });
    });
    return;
  }

  //------------------------------------------------------------------
  // [VULN] POST /api/upload  –  Unrestricted File Upload
  //------------------------------------------------------------------
  if (req.method === 'POST' && pathname === '/api/upload') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      // VULN: no extension/MIME check, filename taken directly from header
      const filename = req.headers['x-filename'] || `upload_${Date.now()}.bin`;
      const uploadDir = '/usr/src/app/uploads';
      const uploadPath = path.join(uploadDir, filename);
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFile(uploadPath, Buffer.concat(chunks), err => {
        if (err) return respond(res, 500, { error: err.message });
        respond(res, 200, { saved: uploadPath, url: `/api/uploads/${filename}` });
      });
    });
    return;
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/uploads/:file  –  Serve uploaded files (enables webshells)
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname.startsWith('/api/uploads/')) {
    const filename = pathname.replace('/api/uploads/', '');
    const filePath = path.join('/usr/src/app/uploads', filename);
    fs.readFile(filePath, (err, data) => {
      if (err) return respond(res, 404, { error: 'not_found' });
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN });
      res.end(data);
    });
    return;
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/debug  –  Sensitive Data Exposure (exposes secrets)
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/debug') {
    // VULN: exposes JWT_SECRET, DATABASE_URL, and DB credentials
    return respond(res, 200, {
      mode: 'debug_enabled',
      env: { DATABASE_URL, JWT_SECRET, PORT, FRONTEND_ORIGIN: ALLOWED_ORIGIN },
      uptime_seconds: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version,
      db_credentials: { user: 'admin', password: 'NYadmin!', db: 'monkeymint' }
    });
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/session  –  Insecure Deserialization (unsigned base64 cookie)
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/session') {
    const cookieHeader = req.headers['cookie'] || '';
    const sessionRaw = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('session='));
    if (sessionRaw) {
      try {
        // VULN: cookie is plain base64 JSON – no HMAC signature, forge isAdmin: true freely
        const sessionData = JSON.parse(Buffer.from(sessionRaw.split('=')[1], 'base64').toString());
        return respond(res, 200, { session: sessionData, isAdmin: sessionData.isAdmin === true });
      } catch (e) {
        return respond(res, 400, { error: 'invalid_session', detail: e.message });
      }
    }
    const authPayload = verifyToken(getAuthToken(req));
    const session = { userId: authPayload?.userId || 'anonymous', isAdmin: false, ts: Date.now() };
    const encoded = Buffer.from(JSON.stringify(session)).toString('base64');
    const body = JSON.stringify({ session, cookie: encoded, hint: 'Decode, set isAdmin:true, re-encode, set as session= cookie' });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${encoded}; Path=/`,
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Content-Length': Buffer.byteLength(body)
    });
    return res.end(body);
  }

  //------------------------------------------------------------------
  // [VULN] GET /api/reviews?nftId=X  +  POST /api/reviews  –  Stored XSS
  //------------------------------------------------------------------
  if (req.method === 'GET' && pathname === '/api/reviews') {
    const { query } = url.parse(req.url, true);
    const nftId = query.nftId || '';
    const sql = `SELECT COALESCE(JSON_AGG(row_to_json(r) ORDER BY r.created_at DESC), '[]'::json) FROM reviews r WHERE r.nft_id = ${escapeSQL(nftId)};`;
    return runQuery(sql, (e, j) =>
      e ? respond(res, 500, { error: e.message })
        : respond(res, 200, JSON.parse(j || '[]'))
    );
  }

  if (req.method === 'POST' && pathname === '/api/reviews') {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      let d;
      try { d = JSON.parse(raw); } catch { return respond(res, 400, { error: 'invalid_json' }); }
      if (!d.nftId || !d.content) return respond(res, 400, { error: 'missing_fields' });
      const authPayload = verifyToken(getAuthToken(req));
      const author = d.author || (authPayload ? `user_${String(authPayload.userId).substring(0, 8)}` : 'anonymous');
      // VULN: content stored verbatim, frontend renders via innerHTML → stored XSS
      const sql = `INSERT INTO reviews (nft_id, author, content) VALUES (${escapeSQL(d.nftId)}, ${escapeSQL(author)}, ${escapeSQL(d.content)}) RETURNING id;`;
      runQuery(sql, e =>
        e ? respond(res, 500, { error: e.message })
          : respond(res, 201, { ok: true })
      );
    });
    return;
  }

  // Fallback 404
  respond(res, 404, { error: 'not_found' });
});

// ------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Backend läuft auf Port ${PORT}`);
  // Auto-create reviews table for stored XSS lab
  runQuery(
    `CREATE TABLE IF NOT EXISTS reviews (
       id         SERIAL PRIMARY KEY,
       nft_id     TEXT NOT NULL,
       author     TEXT NOT NULL DEFAULT 'anonymous',
       content    TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    err => { if (err) console.error('reviews table init failed:', err.message); }
  );
});