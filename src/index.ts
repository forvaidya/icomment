import { Hono } from 'hono';
import { GlobalChat } from './durable-objects/global-chat';

type Env = {
  Variables: {
    userEmail?: string;
    isAdmin?: boolean;
    claims?: Record<string, unknown>;
  };
  Bindings: {
    DB: any;
    KV_ADMIN: any;
    R2_PROFILES: any;
    CHAT: any;
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
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; margin: 0; }
        .edit-link { text-decoration: none; background: #007bff; color: white; padding: 8px 16px; border-radius: 4px; font-size: 14px; }
        .edit-link:hover { background: #0056b3; }
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
        <div class="header">
          <h1>✅ Psychomments Worker</h1>
          ${userEmail ? `<a href="/profile/edit" class="edit-link">Edit Profile</a>` : ''}
        </div>
        <p style="font-size: 20px; margin: 15px 0;">🐱 Jolly the cat</p>

        <div class="welcome">
          Welcome ${roleDisplay}
        </div>

        <div class="status">
          <strong class="success">✓ Worker deployed successfully</strong>
          <p>Your Cloudflare Worker is live and responding to requests.</p>
        </div>

        <div class="endpoints">
          <strong>Available Endpoints (Step 04 Profiles + R2):</strong>
          <ul>
            <li>POST /users - Create user</li>
            <li>GET /users/:id - Get user profile</li>
            <li>PUT /users/:id - Update profile</li>
            <li>POST /users/:id/avatar - Upload profile image</li>
            <li>POST /boards - Create board</li>
            <li>GET /boards - List boards</li>
            <li>POST /general_messages - Create message</li>
            <li>GET /general_messages - List messages</li>
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
            <li>✓ Step 04: User profiles + R2 (in progress)</li>
            <li>→ Step 05: Durable Objects</li>
            <li>→ Step 06: WebSocket</li>
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

// User profile routes
app.post('/users', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { email, username, bio } = body;

  if (!email) {
    return c.json({ error: 'Missing required field: email' }, 400);
  }

  const id = crypto.randomUUID();
  try {
    await db
      .prepare('INSERT INTO users (id, email, username, bio) VALUES (?, ?, ?, ?)')
      .bind(id, email, username || null, bio || null)
      .run();

    return c.json(
      {
        id,
        email,
        username: username || null,
        bio: bio || null,
        profile_image_url: null,
        created_at: new Date().toISOString(),
      },
      201
    );
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return c.json({ error: 'Email or username already exists' }, 409);
    }
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

app.get('/users/:id', async (c) => {
  const db = c.env.DB;
  const userId = c.req.param('id');

  const result = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

  if (!result) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(result);
});

app.put('/users/:id', async (c) => {
  const db = c.env.DB;
  const userId = c.req.param('id');
  const body = await c.req.json();
  const { username, bio } = body;

  const result = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

  if (!result) {
    return c.json({ error: 'User not found' }, 404);
  }

  try {
    await db
      .prepare('UPDATE users SET username = ?, bio = ? WHERE id = ?')
      .bind(username || result.username, bio !== undefined ? bio : result.bio, userId)
      .run();

    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return c.json(updated);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return c.json({ error: 'Username already in use' }, 409);
    }
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

app.post('/users/:id/avatar', async (c) => {
  const db = c.env.DB;
  const r2 = c.env.R2_PROFILES;
  const userId = c.req.param('id');

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const form = await c.req.formData();
  const file = form.get('file') as any;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_SIZE = 5 * 1024 * 1024;

  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: 'Invalid file type. Allowed: jpg, png, webp' }, 400);
  }

  if (file.size > MAX_SIZE) {
    return c.json({ error: 'File too large. Max: 5MB' }, 400);
  }

  const timestamp = Date.now();
  const filename = `users/${userId}/${timestamp}-${file.name}`;

  const buffer = await file.arrayBuffer();
  await r2.put(filename, buffer, {
    httpMetadata: { contentType: file.type },
  });

  const publicUrl = `https://psychomments.cdn.r2.io/${filename}`;

  await db
    .prepare('UPDATE users SET profile_image_url = ? WHERE id = ?')
    .bind(publicUrl, userId)
    .run();

  const updated = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  return c.json(updated, 200);
});

// Profile edit UI (requires authentication)
app.get('/profile/edit', async (c) => {
  const userEmail = c.get('userEmail');

  if (!userEmail) {
    return c.html('<h1>Not Authenticated</h1><p>Please log in via CF Access</p>');
  }

  const db = c.env.DB;
  let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(userEmail).first();

  if (!user) {
    const newId = crypto.randomUUID();
    await db
      .prepare('INSERT INTO users (id, email) VALUES (?, ?)')
      .bind(newId, userEmail)
      .run();
    user = { id: newId, email: userEmail, username: null, bio: null, profile_image_url: null };
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Edit Profile</title>
      <style>
        body { font-family: sans-serif; padding: 40px; background: #f5f5f5; }
        .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
        h1 { color: #333; }
        .form-group { margin: 20px 0; }
        label { display: block; font-weight: bold; margin-bottom: 5px; }
        input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; }
        textarea { resize: vertical; min-height: 100px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        button:hover { background: #0056b3; }
        .back-link { color: #007bff; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
        .email-display { background: #f0f0f0; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Edit Profile</h1>
        <a href="/" class="back-link">← Back</a>

        <div class="email-display">
          <strong>Email:</strong> ${user.email}
        </div>

        <form method="POST" action="/profile/edit">
          <div class="form-group">
            <label for="username">Username:</label>
            <input type="text" id="username" name="username" value="${user.username || ''}" placeholder="Your username">
          </div>

          <div class="form-group">
            <label for="bio">Bio:</label>
            <textarea id="bio" name="bio" placeholder="Tell us about yourself">${user.bio || ''}</textarea>
          </div>

          <button type="submit">Save Profile</button>
        </form>
      </div>
    </body>
    </html>
  `;

  return c.html(html);
});

app.post('/profile/edit', async (c) => {
  const userEmail = c.get('userEmail');

  if (!userEmail) {
    return c.html('<h1>Not Authenticated</h1>');
  }

  const db = c.env.DB;
  const form = await c.req.formData();
  const username = form.get('username') as string | null;
  const bio = form.get('bio') as string | null;

  try {
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(userEmail).first();

    if (!user) {
      return c.html('<h1>User not found</h1>');
    }

    await db
      .prepare('UPDATE users SET username = ?, bio = ? WHERE id = ?')
      .bind(username || null, bio || null, user.id)
      .run();

    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Profile Updated</title>
        <style>
          body { font-family: sans-serif; padding: 40px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; text-align: center; }
          .success { background: #d4edda; padding: 15px; border-radius: 4px; margin: 20px 0; color: #155724; }
          a { color: #007bff; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Profile Updated</h1>
          <div class="success">
            <p>Your profile has been saved successfully!</p>
          </div>
          <p><a href="/">← Back to Home</a></p>
        </div>
      </body>
      </html>
    `);
  } catch (err: any) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: sans-serif; padding: 40px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; text-align: center; }
          .error { background: #f8d7da; padding: 15px; border-radius: 4px; margin: 20px 0; color: #721c24; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Error</h1>
          <div class="error">
            <p>${err.message?.includes('UNIQUE') ? 'Username already in use' : 'Failed to update profile'}</p>
          </div>
          <p><a href="/profile/edit">← Try again</a></p>
        </div>
      </body>
      </html>
    `);
  }
});

// Topics endpoints
app.post('/topics', async (c) => {
  const isAdmin = c.get('isAdmin');
  const userEmail = c.get('userEmail');

  if (!isAdmin) {
    return c.json({ error: 'Only admins can create topics' }, 403);
  }

  if (!userEmail) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.env.DB;
  const body = await c.req.json();
  const { title, description } = body;

  if (!title) {
    return c.json({ error: 'Title required' }, 400);
  }

  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO topics (id, board_id, title, created_by) VALUES (?, ?, ?, ?)')
    .bind(id, 'default', title, userEmail)
    .run();

  return c.json({ id, title, description, created_at: new Date().toISOString() }, 201);
});

app.get('/topics', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM topics ORDER BY created_at DESC').all();
  return c.json(result.results || []);
});

app.get('/topics/:id', async (c) => {
  const db = c.env.DB;
  const topicId = c.req.param('id');
  const result = await db.prepare('SELECT * FROM topics WHERE id = ?').bind(topicId).first();

  if (!result) {
    return c.json({ error: 'Topic not found' }, 404);
  }

  return c.json(result);
});

// Comments endpoints
app.get('/topics/:id/comments', async (c) => {
  const db = c.env.DB;
  const topicId = c.req.param('id');
  const result = await db
    .prepare('SELECT * FROM comments WHERE topic_id = ? ORDER BY created_at ASC')
    .bind(topicId)
    .all();

  return c.json(result.results || []);
});

app.post('/topics/:id/comments', async (c) => {
  const db = c.env.DB;
  const chat = c.env.CHAT;
  const userEmail = c.get('userEmail');
  const topicId = c.req.param('id');

  if (!userEmail) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const body = await c.req.json();
  const { content } = body;

  if (!content) {
    return c.json({ error: 'Content required' }, 400);
  }

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // Write to D1
  await db
    .prepare('INSERT INTO comments (id, topic_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, topicId, userEmail, content, timestamp)
    .run();

  // Notify DO to broadcast
  const comment = { id, topic_id: topicId, user: userEmail, content, created_at: timestamp };
  try {
    const chatDo = chat.get('global-chat');
    await chatDo.fetch(
      new Request('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'new-comment', data: comment }),
      })
    );
  } catch (err) {
    console.error('Failed to notify DO:', err);
  }

  return c.json(comment, 201);
});

// WebSocket endpoint
app.get('/ws', async (c) => {
  const chat = c.env.CHAT;
  const chatDo = chat.get('global-chat');

  // Upgrade to WebSocket via DO
  return chatDo.fetch(c.req.raw);
});

export default app;
export { GlobalChat };
