import { Hono } from 'hono';

type Env = {
  Variables: {
    userEmail?: string;
    isAdmin?: boolean;
    claims?: Record<string, unknown>;
  };
  Bindings: {
    DB: any;
    KV_ADMIN: any;
    ENVIRONMENT?: string;
  };
};

const app = new Hono<Env>();

function decodeJWT(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const decoded = JSON.parse(atob(parts[1]));
    return decoded;
  } catch {
    return null;
  }
}

// Middleware: Extract JWT and determine user role
app.use('*', async (c, next) => {
  const token = c.req.header('Cf-Access-Jwt-Assertion');
  const claims = token ? decodeJWT(token) : null;
  const userEmail = claims?.email as string | undefined;

  c.set('claims', claims || undefined);
  c.set('userEmail', userEmail);

  if (userEmail) {
    const adminList = await c.env.KV_ADMIN.get('admin-emails');
    const admins = adminList ? JSON.parse(adminList) : [];
    c.set('isAdmin', admins.includes(userEmail));
  } else {
    c.set('isAdmin', false);
  }

  await next();
});

// Diagnostic page
app.get('/', async (c) => {
  const userEmail = c.get('userEmail');
  const isAdmin = c.get('isAdmin');
  const claims = c.get('claims');

  let roleDisplay = 'Unauthenticated';
  if (userEmail) {
    roleDisplay = isAdmin ? `Admin: ${userEmail}` : `Patron: ${userEmail}`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Psychomments - Worker is Running</title>
      <style>
        body { font-family: sans-serif; padding: 40px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .status { background: #d4edda; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .welcome { background: #cfe2ff; padding: 15px; border-radius: 4px; margin: 20px 0; font-weight: bold; }
        .jwt-info { background: #e7f3ff; padding: 15px; border-radius: 4px; margin: 20px 0; font-family: monospace; font-size: 12px; }
        .success { color: #155724; }
        .info { color: #004085; }
        .endpoints { background: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ Psychomments Worker is Running</h1>
        <p style="font-size: 20px; margin: 15px 0;">🐱 Jolly the cat</p>

        <div class="welcome">
          Welcome ${roleDisplay}
        </div>

        <div class="status">
          <strong class="success">✓ Worker deployed successfully</strong>
          <p>Your Cloudflare Worker is live and responding to requests.</p>
        </div>

        <div class="endpoints">
          <strong>Available Endpoints (Step 03 Router):</strong>
          <ul>
            <li>POST /boards - Create board</li>
            <li>GET /boards - List boards</li>
            <li>POST /general_messages - Create message</li>
            <li>GET /general_messages - List messages (query: board_id)</li>
          </ul>
        </div>

        <div class="jwt-info">
          <strong class="info">JWT Info:</strong>
          <p>${claims ? JSON.stringify(claims, null, 2) : 'No JWT token in request'}</p>
        </div>

        <div style="margin-top: 20px; color: #666;">
          <p><strong>Progress:</strong></p>
          <ul>
            <li>✓ Step 01: Worker + CF Access ✅</li>
            <li>✓ Step 02: D1 CRUD ✅</li>
            <li>✓ Step 03: Hono Router ✅</li>
            <li>→ Step 04: User profiles + R2</li>
            <li>→ Step 05-06: DO, WebSocket</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `;

  return c.html(html);
});

// Boards routes
app.post('/boards', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { name, description, created_by } = body;

  if (!name || !created_by) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO boards (id, name, description, created_by) VALUES (?, ?, ?, ?)')
    .bind(id, name, description || null, created_by)
    .run();

  return c.json({ id, name, description, created_by, created_at: new Date().toISOString() }, 201);
});

app.get('/boards', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all();
  return c.json(result.results);
});

// Messages routes
app.post('/general_messages', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { board_id, user_id, content } = body;

  if (!board_id || !user_id || !content) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO general_messages (id, board_id, user_id, content) VALUES (?, ?, ?, ?)')
    .bind(id, board_id, user_id, content)
    .run();

  return c.json({ id, board_id, user_id, content, created_at: new Date().toISOString() }, 201);
});

app.get('/general_messages', async (c) => {
  const db = c.env.DB;
  const board_id = c.req.query('board_id');

  let query = 'SELECT * FROM general_messages';
  const params = [];

  if (board_id) {
    query += ' WHERE board_id = ?';
    params.push(board_id);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const result = await db.prepare(query).bind(...params).all();
  return c.json(result.results);
});

export default app;
