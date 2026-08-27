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
          <strong>Available Endpoints (Step 05 Real-Time Chat):</strong>
          <ul>
            <li><strong>Topics:</strong></li>
            <li>POST /topics - Create topic (admin only)</li>
            <li>GET /topics - List topics + create form</li>
            <li>GET /topics/:id - Get topic</li>
            <li><strong>Comments:</strong></li>
            <li>POST /topics/:id/comments - Post comment</li>
            <li>GET /topics/:id/comments - List comments</li>
            <li>POST /topics/:id/comments/upload-image - Upload image to R2</li>
            <li><strong>Chat UI:</strong></li>
            <li>GET /topics/:id/chat - Interactive chat with markdown + images</li>
            <li>GET /ws - WebSocket real-time updates</li>
            <li><strong>Profiles:</strong></li>
            <li>POST /users - Create user</li>
            <li>GET /users/:id - Get user profile</li>
            <li>PUT /users/:id - Update profile</li>
            <li>POST /users/:id/avatar - Upload profile image</li>
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
            <li>✓ Step 04: User profiles + R2 ✅</li>
            <li>✓ Step 05: Real-Time Chat (DO + WebSocket + Markdown + Images) ✅</li>
            <li>→ Step 06: Polish & optimization</li>
          </ul>
          <p style="margin-top: 15px; font-size: 14px;">
            <a href="/topics" style="color: #007bff; text-decoration: none; font-weight: bold;">→ Go to Topics →</a>
          </p>
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

  try {
    await db
      .prepare('INSERT INTO users (email, username, bio) VALUES (?, ?, ?)')
      .bind(email, username || null, bio || null)
      .run();

    return c.json(
      {
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

app.get('/users/:email', async (c) => {
  const db = c.env.DB;
  const email = c.req.param('email');

  const result = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

  if (!result) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(result);
});

app.put('/users/:email', async (c) => {
  const db = c.env.DB;
  const email = c.req.param('email');
  const body = await c.req.json();
  const { username, bio } = body;

  const result = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

  if (!result) {
    return c.json({ error: 'User not found' }, 404);
  }

  try {
    await db
      .prepare('UPDATE users SET username = ?, bio = ? WHERE email = ?')
      .bind(username || result.username, bio !== undefined ? bio : result.bio, email)
      .run();

    const updated = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    return c.json(updated);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return c.json({ error: 'Username already in use' }, 409);
    }
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

app.post('/users/:email/avatar', async (c) => {
  const db = c.env.DB;
  const r2 = c.env.R2_PROFILES;
  const email = c.req.param('email');

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
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
  const filename = `users/${email}/${timestamp}-${file.name}`;

  const buffer = await file.arrayBuffer();
  await r2.put(filename, buffer, {
    httpMetadata: { contentType: file.type },
  });

  const publicUrl = `https://psychomments.cdn.r2.io/${filename}`;

  await db
    .prepare('UPDATE users SET profile_image_url = ? WHERE email = ?')
    .bind(publicUrl, email)
    .run();

  const updated = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
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
    await db
      .prepare('INSERT INTO users (email) VALUES (?)')
      .bind(userEmail)
      .run();
    user = { email: userEmail, username: null, bio: null, profile_image_url: null };
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

  const topicId = crypto.randomUUID();

  try {
    // Ensure user exists (email is now the PK)
    await db
      .prepare('INSERT OR IGNORE INTO users (email) VALUES (?)')
      .bind(userEmail)
      .run();

    // Ensure default board exists
    await db
      .prepare('INSERT OR IGNORE INTO boards (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('general', 'General Discussion', 'Default board', userEmail, new Date().toISOString())
      .run();

    // Create topic
    await db
      .prepare('INSERT INTO topics (id, board_id, title, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(topicId, 'general', title, userEmail, new Date().toISOString())
      .run();

    return c.json({
      id: topicId,
      title,
      description: description || null,
      created_at: new Date().toISOString()
    }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create topic: ' + err.message }, 500);
  }
});

app.get('/topics', async (c) => {
  const db = c.env.DB;
  const isAdmin = c.get('isAdmin');
  const userEmail = c.get('userEmail');

  let topics: any[] = [];
  try {
    const result = await db.prepare('SELECT * FROM topics ORDER BY created_at DESC').all();
    topics = result.results || [];
  } catch (err: any) {
    console.error('Failed to fetch topics:', err);
    return c.text('Error: ' + err.message, 500);
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Topics - Psychomments</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5; padding: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 30px; }
        .user-info { background: #e7f3ff; padding: 15px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; }
        .admin-panel { background: #fff; padding: 25px; border-radius: 8px; margin-bottom: 30px; border: 2px solid #007bff; }
        .form-group { margin-bottom: 15px; }
        label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 14px; }
        input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; font-size: 14px; }
        textarea { resize: vertical; min-height: 80px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
        button:hover { background: #0056b3; }
        .topics-list { display: grid; gap: 15px; }
        .topic-card { background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #eee; cursor: pointer; transition: all 0.2s; }
        .topic-card:hover { border-color: #007bff; box-shadow: 0 2px 8px rgba(0,123,255,0.1); }
        .topic-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 8px; }
        .topic-desc { font-size: 14px; color: #666; margin-bottom: 10px; }
        .topic-meta { font-size: 12px; color: #999; }
        .topic-link { color: #007bff; text-decoration: none; font-size: 14px; font-weight: bold; }
        .topic-link:hover { text-decoration: underline; }
        .empty { text-align: center; color: #666; padding: 40px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Topics</h1>

        ${userEmail ? `<div class="user-info">Logged in as: <strong>${userEmail}</strong> ${isAdmin ? '👑 Admin' : ''}</div>` : ''}

        ${isAdmin ? `
          <div class="admin-panel">
            <h2 style="margin-bottom: 20px;">Create New Topic</h2>
            <form onsubmit="createTopic(event)">
              <div class="form-group">
                <label>Title *</label>
                <input type="text" id="title" required placeholder="Topic title">
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea id="description" placeholder="Optional description"></textarea>
              </div>
              <button type="submit">Create Topic</button>
              <div id="createStatus" style="margin-top: 10px; font-size: 14px;"></div>
            </form>
          </div>
        ` : ''}

        <h2 style="margin-bottom: 20px;">All Topics</h2>
        ${topics.length === 0 ? `
          <div class="empty">
            <p>No topics yet.</p>
            ${isAdmin ? '<p>Create one above!</p>' : '<p>Check back later.</p>'}
          </div>
        ` : `
          <div class="topics-list">
            ${topics.map((t: any) => `
              <div class="topic-card">
                <div class="topic-title">${t.title}</div>
                ${t.description ? `<div class="topic-desc">${t.description}</div>` : ''}
                <div class="topic-meta">Created by: ${t.created_by}</div>
                <a href="/topics/${t.id}/chat" class="topic-link">Enter Chat →</a>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <script>
        async function createTopic(event) {
          event.preventDefault();
          const title = document.getElementById('title').value;
          const description = document.getElementById('description').value;
          const status = document.getElementById('createStatus');

          status.textContent = 'Creating...';
          status.style.color = '#0066cc';

          const res = await fetch('/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description })
          });

          if (res.ok) {
            status.textContent = 'Topic created! Reloading...';
            status.style.color = '#28a745';
            setTimeout(() => location.reload(), 1000);
          } else {
            const err = await res.json();
            status.textContent = 'Error: ' + (err.error || 'Failed to create');
            status.style.color = '#dc3545';
          }
        }
      </script>
    </body>
    </html>
  `;

  return c.html(html);
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
  const since = c.req.query('since');

  try {
    let query = 'SELECT * FROM comments WHERE topic_id = ?';
    const params: any[] = [topicId];

    if (since) {
      query += ' AND created_at > ?';
      params.push(since);
    }

    query += ' ORDER BY created_at ASC';

    const result = await db.prepare(query).bind(...params).all();
    return c.json(result.results || []);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch comments: ' + err.message }, 500);
  }
});

app.post('/topics/:id/comments', async (c) => {
  const db = c.env.DB;
  const chat = c.env.CHAT;
  const userEmail = c.get('userEmail');
  const topicId = c.req.param('id');

  if (!userEmail) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  if (!topicId) {
    return c.json({ error: 'Topic ID required' }, 400);
  }

  try {
    const body = await c.req.json();
    const { content } = body;

    if (!content || content.trim() === '') {
      return c.json({ error: 'Content required' }, 400);
    }

    // Ensure user exists (email is the PK)
    try {
      await db
        .prepare('INSERT OR IGNORE INTO users (email) VALUES (?)')
        .bind(userEmail)
        .run();
    } catch (err) {
      console.error('Failed to create/get user:', err);
      throw new Error('User creation failed: ' + err);
    }

    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    try {
      await db
        .prepare('INSERT INTO comments (id, topic_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, topicId, userEmail, content, timestamp)
        .run();
    } catch (err) {
      console.error('Failed to insert comment:', err);
      throw new Error('Comment insert failed: ' + err);
    }

    const comment = { id, topic_id: topicId, user: userEmail, content, created_at: timestamp };

    // Notify DO to broadcast (fire and forget, don't await)
    chat.get(chat.idFromName('global-chat')).fetch(
      new Request('http://internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'new-comment', data: comment }),
      })
    ).catch((err: any) => console.error('DO broadcast error:', err));

    return c.json(comment, 201);
  } catch (err: any) {
    console.error('Comment post error:', err.message, err.stack);
    return c.json({ error: 'Failed to post comment: ' + err.message }, 500);
  }
});

// Image upload for comments
app.post('/topics/:id/comments/upload-image', async (c) => {
  const r2 = c.env.R2_PROFILES;
  const topicId = c.req.param('id');
  const userEmail = c.get('userEmail');

  if (!userEmail) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const form = await c.req.formData();
  const file = form.get('file') as any;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MAX_SIZE = 5 * 1024 * 1024;

  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: 'Invalid file type. Allowed: jpg, png, webp, gif' }, 400);
  }

  if (file.size > MAX_SIZE) {
    return c.json({ error: 'File too large. Max: 5MB' }, 400);
  }

  const timestamp = Date.now();
  const filename = `comments/${topicId}/${timestamp}-${file.name}`;

  const buffer = await file.arrayBuffer();
  await r2.put(filename, buffer, {
    httpMetadata: { contentType: file.type },
  });

  const publicUrl = `https://psychomments.cdn.r2.io/${filename}`;

  return c.json({ url: publicUrl });
});

// Chat UI page
app.get('/topics/:id/chat', async (c) => {
  const topicId = c.req.param('id');
  const db = c.env.DB;
  const userEmail = c.get('userEmail');

  if (!userEmail) {
    return c.html('<h1>Not Authenticated</h1><p>Please log in via CF Access</p>');
  }

  // Fetch topic
  const topic = await db.prepare('SELECT * FROM topics WHERE id = ?').bind(topicId).first();

  if (!topic) {
    return c.html('<h1>Topic Not Found</h1>');
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${topic.title} - Chat</title>
      <script src="https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js" type="module"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5; }
        .container { max-width: 900px; margin: 0 auto; display: flex; height: 100vh; }
        .sidebar { width: 250px; background: #fff; border-right: 1px solid #ddd; padding: 20px; overflow-y: auto; }
        .main { flex: 1; display: flex; flex-direction: column; }
        .header { background: #fff; padding: 20px; border-bottom: 1px solid #ddd; }
        .comments-area { flex: 1; overflow-y: auto; padding: 20px; }
        .comment { background: #fff; margin-bottom: 15px; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
        .comment-meta { font-size: 12px; color: #666; margin-bottom: 8px; }
        .comment-user { font-weight: bold; }
        .comment-content { line-height: 1.6; }
        .comment-content img { max-width: 100%; border-radius: 4px; margin: 10px 0; }
        .comment-content code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
        .comment-content pre { background: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 10px 0; }
        .editor-area { background: #fff; padding: 20px; border-top: 1px solid #ddd; }
        .editor-container { display: flex; gap: 15px; }
        .editor-input { flex: 1; display: flex; flex-direction: column; }
        .preview { flex: 0 0 40%; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; padding: 10px; overflow-y: auto; max-height: 200px; }
        textarea { width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 14px; resize: vertical; }
        .editor-tools { margin-top: 10px; display: flex; gap: 10px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        button:hover { background: #0056b3; }
        .upload-area { border: 2px dashed #007bff; border-radius: 4px; padding: 20px; text-align: center; background: #f0f7ff; cursor: pointer; }
        .upload-area.active { background: #007bff; color: white; }
        .status { font-size: 12px; color: #666; margin-top: 5px; }
        .loading { color: #0066cc; }
        h1 { font-size: 24px; margin: 0; }
        .back-link { color: #007bff; text-decoration: none; font-size: 14px; }
        .back-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="sidebar">
          <a href="/topics" class="back-link">← Back to Topics</a>
          <h3 style="margin-top: 20px;">${topic.title}</h3>
          <p style="font-size: 12px; color: #666; margin-top: 10px;">${topic.description || 'No description'}</p>
        </div>

        <div class="main">
          <div class="header">
            <h1>${topic.title}</h1>
            <small style="color: #666;">Logged in as: ${userEmail}</small>
          </div>

          <div class="comments-area" id="comments"></div>

          <div class="editor-area">
            <div class="editor-container">
              <div class="editor-input">
                <textarea id="editor" placeholder="Type your comment... Paste images or drag-drop to embed them. Markdown supported."></textarea>
                <div class="editor-tools">
                  <button onclick="postComment()">Send</button>
                  <div class="upload-area" id="uploadArea">
                    Drop images here or click
                    <input type="file" id="imageInput" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">
                  </div>
                </div>
                <div class="status" id="status"></div>
              </div>
              <div class="preview" id="preview"></div>
            </div>
          </div>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/marked/lib/marked.min.js"></script>
      <script>
        const topicId = '${topicId}';
        const userEmail = '${userEmail}';
        let ws = null;
        let messages = new Map();

        // Wait for marked to load
        function waitForMarked(callback) {
          if (typeof window.marked === 'function') {
            callback();
          } else {
            setTimeout(() => waitForMarked(callback), 50);
          }
        }

        // Load initial comments
        async function loadComments() {
          const res = await fetch(\`/topics/\${topicId}/comments\`);
          const comments = await res.json();
          comments.forEach(c => messages.set(c.id, c));
          renderComments();
        }

        // Connect WebSocket
        function connectWebSocket() {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = \`\${protocol}//\${window.location.host}/ws\`;
          ws = new WebSocket(wsUrl);
          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'new-comment' && msg.data.topic_id === topicId) {
                messages.set(msg.data.id, msg.data);
                renderComments();
              }
            } catch (err) {
              console.error('WebSocket message error:', err);
            }
          };
          ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            updateStatus('WebSocket connection failed', 'error');
          };
          ws.onopen = () => updateStatus('Connected', 'ok');
          ws.onclose = () => updateStatus('Disconnected', 'error');
        }

        // Render comments
        function renderComments() {
          const sorted = Array.from(messages.values())
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

          const html = sorted.map(c => \`
            <div class="comment">
              <div class="comment-meta">
                <span class="comment-user">\${c.user}</span> •
                <small>\${new Date(c.created_at).toLocaleString()}</small>
              </div>
              <div class="comment-content">\${typeof window.marked === 'function' ? window.marked(c.content) : c.content}</div>
            </div>
          \`).join('');

          document.getElementById('comments').innerHTML = html;
        }

        // Post comment
        function postComment() {
          const content = document.getElementById('editor').value.trim();
          if (!content) return;

          fetch(\`/topics/\${topicId}/comments\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
          }).then(res => {
            if (res.ok) {
              document.getElementById('editor').value = '';
              document.getElementById('preview').innerHTML = '';
              updateStatus('Comment sent', 'ok');
            } else {
              updateStatus('Failed to post', 'error');
            }
          }).catch(err => {
            console.error('Post error:', err);
            updateStatus('Error posting comment', 'error');
          });
        }

        // Update preview
        function setupPreview() {
          const editor = document.getElementById('editor');
          if (editor) {
            editor.addEventListener('input', (e) => {
              const preview = document.getElementById('preview');
              if (preview && typeof window.marked === 'function') {
                try {
                  preview.innerHTML = window.marked(e.target.value);
                } catch (err) {
                  console.error('Marked error:', err);
                  preview.innerHTML = '<pre>' + e.target.value + '</pre>';
                }
              }
            });
          }
        }

        // Upload image
        function uploadImage(file) {
          if (!file.type.startsWith('image/')) return;
          updateStatus('Uploading image...', 'loading');

          const form = new FormData();
          form.append('file', file);

          fetch(\`/topics/\${topicId}/comments/upload-image\`, {
            method: 'POST',
            body: form
          }).then(res => res.json()).then(data => {
            if (data.url) {
              const markdown = \`![image](\${data.url})\`;
              const editor = document.getElementById('editor');
              editor.value += '\\n' + markdown + '\\n';
              editor.dispatchEvent(new Event('input'));
              updateStatus('Image uploaded', 'ok');
            } else {
              updateStatus('Upload failed', 'error');
            }
          }).catch(err => {
            console.error('Upload error:', err);
            updateStatus('Upload failed', 'error');
          });
        }

        function handleFileSelect(event) {
          const file = event.target.files[0];
          if (file) uploadImage(file);
        }

        function updateStatus(msg, type) {
          const el = document.getElementById('status');
          if (el) {
            el.textContent = msg;
            el.className = 'status ' + type;
          }
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
          waitForMarked(() => {
            setupPreview();
            loadComments();
            connectWebSocket();

            // Drag and drop
            const uploadArea = document.getElementById('uploadArea');
          if (uploadArea) {
            uploadArea.addEventListener('click', () => document.getElementById('imageInput').click());
            uploadArea.addEventListener('dragover', (e) => {
              e.preventDefault();
              uploadArea.classList.add('active');
            });
            uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('active'));
            uploadArea.addEventListener('drop', (e) => {
              e.preventDefault();
              uploadArea.classList.remove('active');
              const file = e.dataTransfer.files[0];
              if (file) uploadImage(file);
            });
          }

          // Paste handler
          const editor = document.getElementById('editor');
          if (editor) {
            editor.addEventListener('paste', (e) => {
              const items = e.clipboardData.items;
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  uploadImage(file);
                }
              }
            });
          }
          });
        });
      </script>
    </body>
    </html>
  `;

  return c.html(html);
});

// WebSocket endpoint
app.get('/ws', async (c) => {
  const chat = c.env.CHAT;
  const chatDo = chat.get(chat.idFromName('global-chat'));
  return chatDo.fetch(c.req.raw);
});

export default app;
export { GlobalChat };
