import { Hono } from 'hono';
import { GlobalChat } from './durable-objects/global-chat';
import { IotHub } from './durable-objects/iot-hub';

type Env = {
  Variables: {
    userEmail?: string;
    isAdmin?: boolean;
    claims?: Record<string, unknown>;
  };
  Bindings: {
    DB: any;
    KV_ADMIN: any;
    IOT_KV: any;
    R2_PROFILES: any;
    CHAT: any;
    IOT_HUB: any;
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
        .topics-list { display: grid; gap: 12px; }
        .topic-card { background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #e8e8e8; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .topic-card:hover { border-color: #007bff; box-shadow: 0 4px 12px rgba(0,123,255,0.15); }
        .topic-title { font-size: 17px; font-weight: 600; color: #333; margin-bottom: 8px; }
        .topic-desc { font-size: 14px; color: #777; margin-bottom: 12px; line-height: 1.4; }
        .topic-meta { font-size: 12px; color: #aaa; margin-bottom: 12px; }
        .topic-link { color: #007bff; text-decoration: none; font-size: 13px; font-weight: 500; }
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

app.put('/topics/:id', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Only admins can edit topics' }, 403);
  }

  const userEmail = c.get('userEmail');
  if (!userEmail) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const db = c.env.DB;
  const topicId = c.req.param('id');
  const body = await c.req.json();
  const { title, description } = body;

  // Fetch current topic
  const topic = await db.prepare('SELECT * FROM topics WHERE id = ?').bind(topicId).first();
  if (!topic) {
    return c.json({ error: 'Topic not found' }, 404);
  }

  // Check if anything changed
  const titleChanged = title && title !== topic.title;
  const descChanged = description !== undefined && description !== topic.description;

  if (!titleChanged && !descChanged) {
    return c.json({ error: 'No changes' }, 400);
  }

  try {
    // Record edit history
    const editId = crypto.randomUUID();
    await db
      .prepare(`
        INSERT INTO topic_edits (id, topic_id, old_title, new_title, old_description, new_description, edited_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        editId,
        topicId,
        titleChanged ? topic.title : null,
        titleChanged ? title : null,
        descChanged ? topic.description : null,
        descChanged ? description : null,
        userEmail
      )
      .run();

    // Update topic
    await db
      .prepare('UPDATE topics SET title = ?, description = ? WHERE id = ?')
      .bind(
        title || topic.title,
        description !== undefined ? description : topic.description,
        topicId
      )
      .run();

    const updated = await db.prepare('SELECT * FROM topics WHERE id = ?').bind(topicId).first();
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: 'Failed to update topic: ' + err.message }, 500);
  }
});

app.get('/topics/:id/edits', async (c) => {
  const db = c.env.DB;
  const topicId = c.req.param('id');

  try {
    const result = await db
      .prepare('SELECT * FROM topic_edits WHERE topic_id = ? ORDER BY edited_at DESC')
      .bind(topicId)
      .all();

    return c.json(result.results || []);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch history: ' + err.message }, 500);
  }
});

// Cleanup: Delete all R2 images for a topic (admin only)
app.delete('/admin/topics/:id/cleanup-images', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Only admins can cleanup' }, 403);
  }

  const r2 = c.env.R2_PROFILES;
  const topicId = c.req.param('id');

  try {
    let deletedCount = 0;

    // Delete active images
    const prefix = `comments/${topicId}/`;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const listResult = await r2.list({ prefix, cursor });
      if (listResult.objects && listResult.objects.length > 0) {
        for (const obj of listResult.objects) {
          await r2.delete(obj.key);
          deletedCount++;
        }
      }
      cursor = listResult.cursor;
      hasMore = listResult.delimitedPrefixes && listResult.delimitedPrefixes.length > 0;
    }

    // Delete archived images for this topic
    const archivedPrefix = `archived/`;
    cursor = undefined;
    hasMore = true;

    while (hasMore) {
      const listResult: any = await r2.list({ prefix: archivedPrefix, cursor });
      if (listResult.objects && listResult.objects.length > 0) {
        for (const obj of listResult.objects) {
          if (obj.key.includes(`comments/${topicId}/`)) {
            await r2.delete(obj.key);
            deletedCount++;
          }
        }
      }
      cursor = listResult.cursor;
      hasMore = !!cursor;
    }

    return c.json({ ok: true, deleted: deletedCount });
  } catch (err: any) {
    return c.json({ error: 'Failed to cleanup images: ' + err.message }, 500);
  }
});

app.delete('/topics/:id', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Only admins can delete topics' }, 403);
  }

  const db = c.env.DB;
  const r2 = c.env.R2_PROFILES;
  const topicId = c.req.param('id');

  // Verify topic exists
  const topic = await db.prepare('SELECT * FROM topics WHERE id = ?').bind(topicId).first();
  if (!topic) {
    return c.json({ error: 'Topic not found' }, 404);
  }

  try {
    // Delete all R2 images for this topic
    const prefix = `comments/${topicId}/`;
    const listResult = await r2.list({ prefix });
    for (const obj of listResult.objects) {
      await r2.delete(obj.key);
    }

    // Delete all comments for this topic
    await db.prepare('DELETE FROM comments WHERE topic_id = ?').bind(topicId).run();
    // Delete the topic
    await db.prepare('DELETE FROM topics WHERE id = ?').bind(topicId).run();
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete topic: ' + err.message }, 500);
  }
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
    // Normalize field names: user_id -> user
    const comments = (result.results || []).map((c: any) => ({
      ...c,
      user: c.user_id,
      user_id: undefined
    }));
    return c.json(comments);
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

    await db
      .prepare('INSERT INTO comments (id, topic_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, topicId, userEmail, content, timestamp)
      .run();

    const comment = { id, topic_id: topicId, user: userEmail, content, created_at: timestamp };

    // Notify DO to broadcast (via fetch with data in header, non-blocking)
    try {
      const doStub = chat.get(chat.idFromName('global-chat'));
      const broadcastPromise = doStub.fetch(
        new Request('http://internal/broadcast', {
          method: 'POST',
          headers: {
            'X-Message': JSON.stringify({ type: 'new-comment', data: comment })
          }
        })
      ).catch((err: any) => {
        console.error('DO broadcast error:', err.message);
      });

      // Keep Worker context alive until DO responds
      c.executionCtx.waitUntil(broadcastPromise);
    } catch (e: any) {
      console.error('DO fetch error:', e.message);
    }

    return c.json(comment, 201);
  } catch (err: any) {
    console.error('Comment post error:', err.message, err.stack);
    return c.json({ error: 'Failed to post comment: ' + err.message }, 500);
  }
});

app.delete('/topics/:id/comments/:commentId', async (c) => {
  const db = c.env.DB;
  const chat = c.env.CHAT;
  const r2 = c.env.R2_PROFILES;
  const userEmail = c.get('userEmail');
  const isAdmin = c.get('isAdmin');
  const topicId = c.req.param('id');
  const commentId = c.req.param('commentId');

  if (!userEmail) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  try {
    // Fetch comment to verify ownership
    const comment = await db
      .prepare('SELECT * FROM comments WHERE id = ? AND topic_id = ?')
      .bind(commentId, topicId)
      .first();

    if (!comment) {
      return c.json({ error: 'Comment not found' }, 404);
    }

    // Check if user is owner or admin
    if (comment.user_id !== userEmail && !isAdmin) {
      return c.json({ error: 'Can only delete your own comments' }, 403);
    }

    // Archive images instead of deleting (rename with timestamp)
    const imageUrls = comment.content.match(/\/image\/([a-f0-9-]+)/g) || [];
    for (const match of imageUrls) {
      const imageId = match.split('/').pop();
      try {
        const prefix = `comments/${topicId}/${imageId}-`;
        const listResult = await r2.list({ prefix });
        if (listResult.objects && listResult.objects.length > 0) {
          const oldKey = listResult.objects[0].key;
          const timestamp = Date.now();
          const newKey = `archived/${timestamp}-${oldKey}`;
          const obj = await r2.get(oldKey);
          if (obj) {
            await r2.put(newKey, obj.body, {
              httpMetadata: obj.httpMetadata,
            });
            await r2.delete(oldKey);
          }
        }
      } catch (err) {
        console.error('Image archive error:', err);
        // Continue even if image archival fails
      }
    }

    // Delete comment
    await db.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run();

    // Broadcast deletion to all clients
    try {
      const doStub = chat.get(chat.idFromName('global-chat'));
      const broadcastPromise = doStub.fetch(
        new Request('http://internal/broadcast', {
          method: 'POST',
          headers: {
            'X-Message': JSON.stringify({ type: 'delete-comment', data: { id: commentId, topic_id: topicId } })
          }
        })
      ).catch((err: any) => {
        console.error('DO broadcast error:', err.message);
      });

      c.executionCtx.waitUntil(broadcastPromise);
    } catch (e: any) {
      console.error('DO fetch error:', e.message);
    }

    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete comment: ' + err.message }, 500);
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

  try {
    const form = await c.req.formData();
    const file = form.get('file') as any;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const MAX_SIZE = 5 * 1024 * 1024;

    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({ error: `Invalid file type: ${file.type}. Allowed: jpg, png, webp, gif` }, 400);
    }

    if (file.size > MAX_SIZE) {
      return c.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 5MB` }, 400);
    }

    const timestamp = Date.now();
    const imageId = crypto.randomUUID();
    const filename = `comments/${topicId}/${imageId}-${file.name}`;

    const buffer = await file.arrayBuffer();
    await r2.put(filename, buffer, {
      httpMetadata: { contentType: file.type },
    });

    // Return authenticated proxy URL (not direct R2 URL)
    const proxyUrl = `/topics/${topicId}/image/${imageId}`;
    return c.json({ url: proxyUrl });
  } catch (err: any) {
    console.error('R2 upload error:', err.message);
    return c.json({ error: `Upload failed: ${err.message}` }, 500);
  }
});

// Authenticated image proxy - only accessible if authenticated
app.get('/topics/:id/image/:imageId', async (c) => {
  const userEmail = c.get('userEmail');
  if (!userEmail) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const r2 = c.env.R2_PROFILES;
  const topicId = c.req.param('id');
  const imageId = c.req.param('imageId');

  try {
    // List objects to find matching image (imageId is UUID, stored as imageId-filename)
    const prefix = `comments/${topicId}/${imageId}-`;
    const listResult = await r2.list({ prefix });

    if (!listResult.objects || listResult.objects.length === 0) {
      return c.json({ error: 'Image not found' }, 404);
    }

    const objectKey = listResult.objects[0].key;
    const obj = await r2.get(objectKey);

    if (!obj) {
      return c.json({ error: 'Image not found' }, 404);
    }

    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: any) {
    console.error('Image fetch error:', err.message);
    return c.json({ error: 'Failed to fetch image' }, 500);
  }
});

// Chat UI page
app.get('/topics/:id/chat', async (c) => {
  const topicId = c.req.param('id');
  const db = c.env.DB;
  const userEmail = c.get('userEmail');
  const isAdmin = c.get('isAdmin');

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
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; display: flex; height: 100vh; }
        .sidebar { width: 280px; background: #fff; border-right: 1px solid #e0e0e0; padding: 20px; overflow-y: auto; }
        .sidebar h3 { font-size: 16px; margin: 15px 0 8px 0; color: #333; }
        .sidebar p { font-size: 13px; color: #888; line-height: 1.4; }
        .main { flex: 1; display: flex; flex-direction: column; background: #f9f9f9; }
        .header { background: #fff; padding: 20px; border-bottom: 1px solid #e0e0e0; }
        .header h1 { font-size: 22px; margin-bottom: 5px; }
        .header small { color: #999; }
        .comments-area { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .comment { background: #fff; padding: 15px; border-radius: 6px; border: 1px solid #e8e8e8; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .comment:hover { border-color: #d0d0d0; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }
        .comment-meta { font-size: 12px; color: #888; margin-bottom: 8px; display: flex; gap: 8px; align-items: center; }
        .comment-user { font-weight: 600; color: #333; }
        .comment-time { color: #aaa; }
        .comment-content { line-height: 1.6; color: #444; font-size: 15px; }
        .comment-content p { margin: 8px 0; }
        .comment-content p:first-child { margin-top: 0; }
        .comment-content p:last-child { margin-bottom: 0; }
        .comment-content img { max-width: 100%; border-radius: 4px; margin: 10px 0; }
        .comment-content code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; color: #c7254e; }
        .comment-content pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; margin: 10px 0; border-left: 3px solid #007bff; }
        .comment-content pre code { background: none; color: inherit; padding: 0; }
        .comment-actions { margin-top: 8px; display: flex; gap: 8px; }
        .comment-delete { background: none; border: none; color: #dc3545; cursor: pointer; font-size: 12px; padding: 0; text-decoration: underline; }
        .comment-delete:hover { color: #c82333; }
        .editor-area { background: #fff; padding: 20px; border-top: 1px solid #e0e0e0; }
        .editor-container { display: flex; gap: 15px; }
        .editor-input { flex: 1; display: flex; flex-direction: column; }
        .preview { flex: 0 0 35%; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; overflow-y: auto; max-height: 180px; font-size: 13px; line-height: 1.5; }
        textarea { width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: 'Monaco', 'Courier New', monospace; font-size: 14px; resize: vertical; }
        textarea:focus { outline: none; border-color: #007bff; box-shadow: 0 0 0 2px rgba(0,123,255,0.1); }
        .editor-tools { margin-top: 10px; display: flex; gap: 10px; align-items: center; }
        button { background: #007bff; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; }
        button:hover { background: #0056b3; }
        button:active { transform: scale(0.98); }
        .upload-area { border: 2px dashed #ccc; border-radius: 4px; padding: 15px; text-align: center; background: #fafafa; cursor: pointer; font-size: 13px; color: #666; flex: 1; }
        .upload-area:hover { border-color: #007bff; background: #f0f7ff; }
        .upload-area.active { background: #007bff; color: white; border-color: #007bff; }
        .status { font-size: 12px; color: #666; margin-top: 5px; min-height: 18px; }
        .status.ok { color: #28a745; }
        .status.error { color: #dc3545; }
        .status.loading { color: #0066cc; }
        h1 { font-size: 20px; margin: 0; }
        .back-link { color: #007bff; text-decoration: none; font-size: 13px; display: inline-block; margin-bottom: 15px; }
        .back-link:hover { text-decoration: underline; }
        .header-tools { display: flex; justify-content: space-between; align-items: center; }
        .delete-topic-btn { background: #dc3545; color: white; padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
        .delete-topic-btn:hover { background: #c82333; }
        .chat-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center; }
        .chat-modal.active { display: flex; }
        .chat-modal-content { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 400px; text-align: center; }
        .chat-modal-content h2 { margin-bottom: 15px; color: #333; }
        .chat-modal-content p { color: #666; margin-bottom: 20px; line-height: 1.5; }
        .chat-modal-actions { display: flex; gap: 10px; justify-content: center; }
        .chat-modal-actions button { padding: 8px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .confirm-delete { background: #dc3545; color: white; }
        .confirm-delete:hover { background: #c82333; }
        .cancel-delete { background: #6c757d; color: white; }
        .cancel-delete:hover { background: #5a6268; }
        .edit-topic-btn { background: #28a745; color: white; padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; margin-left: 8px; }
        .edit-topic-btn:hover { background: #218838; }
        .edit-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center; overflow-y: auto; }
        .edit-modal.active { display: flex; }
        .edit-modal-content { background: white; margin: auto; width: 90%; max-width: 500px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        .edit-modal-header { padding: 20px; border-bottom: 1px solid #e0e0e0; }
        .edit-modal-header h2 { margin: 0; color: #333; }
        .edit-modal-body { padding: 20px; max-height: 60vh; overflow-y: auto; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 5px; color: #333; font-size: 14px; }
        .form-group input, .form-group textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; font-size: 14px; }
        .form-group textarea { resize: vertical; min-height: 80px; }
        .edit-modal-footer { padding: 15px 20px; border-top: 1px solid #e0e0e0; display: flex; gap: 10px; justify-content: flex-end; }
        .history-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; }
        .history-section h3 { font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #333; }
        .history-item { background: #f9f9f9; padding: 10px; border-radius: 4px; margin-bottom: 8px; font-size: 12px; }
        .history-item-meta { color: #666; font-size: 11px; margin-bottom: 5px; }
        .history-change { color: #444; line-height: 1.4; }
        .history-change .old { text-decoration: line-through; color: #999; }
        .history-change .new { color: #28a745; font-weight: 500; }
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
            <div class="header-tools">
              <div>
                <h1>${topic.title}</h1>
                <small style="color: #666;">Logged in as: ${userEmail}</small>
              </div>
              <div>
                ${isAdmin ? `<button class="edit-topic-btn" onclick="showEditModal()">Edit</button>` : ''}
                ${isAdmin ? `<button class="delete-topic-btn" onclick="showChatDeleteModal()">Delete Topic</button>` : ''}
              </div>
            </div>
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

      <div class="chat-modal" id="chatDeleteModal">
        <div class="chat-modal-content">
          <h2>Delete Topic?</h2>
          <p>Delete "${topic.title}" and all <span id="chatMessageCount">0</span> messages? This cannot be undone.</p>
          <div class="chat-modal-actions">
            <button class="confirm-delete" onclick="confirmChatDelete()">Delete</button>
            <button class="cancel-delete" onclick="closeChatDeleteModal()">Cancel</button>
          </div>
        </div>
      </div>

      <div class="edit-modal" id="editModal">
        <div class="edit-modal-content">
          <div class="edit-modal-header">
            <h2>Edit Topic</h2>
          </div>
          <div class="edit-modal-body">
            <div class="form-group">
              <label for="editTitle">Title</label>
              <input type="text" id="editTitle" value="${topic.title}" placeholder="Topic title">
            </div>
            <div class="form-group">
              <label for="editDesc">Description</label>
              <textarea id="editDesc" placeholder="Topic description">${topic.description || ''}</textarea>
            </div>
            <div class="history-section" id="historySection" style="display: none;">
              <h3>Edit History</h3>
              <div id="historyList"></div>
            </div>
          </div>
          <div class="edit-modal-footer">
            <button onclick="closeEditModal()" class="modal-cancel">Cancel</button>
            <button onclick="saveTopicEdit()" class="modal-confirm">Save Changes</button>
          </div>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/marked/lib/marked.min.js"></script>
      <script>
        const topicId = '${topicId}';
        const userEmail = '${userEmail}';
        let ws = null;
        let messages = new Map();

        function showChatDeleteModal() {
          document.getElementById('chatMessageCount').textContent = messages.size;
          document.getElementById('chatDeleteModal').classList.add('active');
        }

        function closeChatDeleteModal() {
          document.getElementById('chatDeleteModal').classList.remove('active');
        }

        async function confirmChatDelete() {
          const res = await fetch(\`/topics/\${topicId}\`, { method: 'DELETE' });
          if (res.ok) {
            window.location.href = '/topics';
          } else {
            const err = await res.json();
            alert('Error: ' + (err.error || 'Failed to delete'));
            closeChatDeleteModal();
          }
        }

        async function showEditModal() {
          document.getElementById('editModal').classList.add('active');
          // Load history
          try {
            const res = await fetch(\`/topics/\${topicId}/edits\`);
            const edits = await res.json();
            if (edits.length > 0) {
              const historyList = document.getElementById('historyList');
              historyList.innerHTML = edits.map(edit => \`
                <div class="history-item">
                  <div class="history-item-meta">
                    \${edit.edited_by} • \${new Date(edit.edited_at).toLocaleString()}
                  </div>
                  <div class="history-change">
                    \${edit.old_title ? \`Title: <span class="old">\${edit.old_title}</span> → <span class="new">\${edit.new_title}</span><br>\` : ''}
                    \${edit.old_description ? \`Description: <span class="old">\${edit.old_description}</span> → <span class="new">\${edit.new_description || '(empty)'}</span>\` : ''}
                  </div>
                </div>
              \`).join('');
              document.getElementById('historySection').style.display = 'block';
            }
          } catch (err) {
            console.error('Failed to load history:', err);
          }
        }

        function closeEditModal() {
          document.getElementById('editModal').classList.remove('active');
        }

        async function saveTopicEdit() {
          const title = document.getElementById('editTitle').value.trim();
          const description = document.getElementById('editDesc').value.trim();

          if (!title) {
            alert('Title is required');
            return;
          }

          try {
            const res = await fetch(\`/topics/\${topicId}\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, description })
            });

            if (res.ok) {
              closeEditModal();
              location.reload();
            } else {
              const err = await res.json();
              alert('Error: ' + (err.error || 'Failed to save'));
            }
          } catch (err) {
            console.error('Save error:', err);
            alert('Error saving changes');
          }
        }

        // Wait for marked to load (with timeout)
        function waitForMarked(callback) {
          if (window.marked && (typeof window.marked === 'function' || typeof window.marked.parse === 'function')) {
            callback();
          } else {
            setTimeout(() => waitForMarked(callback), 100);
          }
        }

        // Load initial comments
        async function loadComments() {
          try {
            const res = await fetch(\`/topics/\${topicId}/comments\`);
            const comments = await res.json();
            comments.forEach(c => messages.set(c.id, c));
            renderComments();
          } catch (err) {
            console.error('Failed to load comments:', err);
            updateStatus('Failed to load messages', 'error');
          }
        }

        // Connect WebSocket (no dependencies, connect immediately)
        function connectWebSocket() {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = \`\${protocol}//\${window.location.host}/ws\`;
          ws = new WebSocket(wsUrl);
          ws.onopen = () => updateStatus('Connected', 'ok');
          ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            updateStatus('Connection failed', 'error');
          };
          ws.onclose = () => updateStatus('Disconnected', 'error');
          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'new-comment' && msg.data.topic_id === topicId) {
                messages.set(msg.data.id, msg.data);
                renderComments();
              } else if (msg.type === 'delete-comment' && msg.data.topic_id === topicId) {
                messages.delete(msg.data.id);
                renderComments();
              }
            } catch (err) {
              console.error('Message parse error:', err);
            }
          };
        }

        // Render comments
        function renderComments() {
          const sorted = Array.from(messages.values())
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

          const html = sorted.map(c => \`
            <div class="comment" id="comment-\${c.id}">
              <div class="comment-meta">
                <span class="comment-user">\${c.user}</span>
                <span class="comment-time">\${new Date(c.created_at).toLocaleString()}</span>
              </div>
              <div class="comment-content">\${window.marked ? (typeof window.marked === 'function' ? window.marked(c.content) : window.marked.parse(c.content)) : c.content}</div>
              \${c.user === userEmail ? \`<div class="comment-actions"><button class="comment-delete" onclick="deleteComment('\${c.id}')">Delete</button></div>\` : ''}
            </div>
          \`).join('');

          const commentsEl = document.getElementById('comments');
          commentsEl.innerHTML = html;
          // Auto-scroll to bottom
          setTimeout(() => commentsEl.scrollTop = commentsEl.scrollHeight, 0);
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

        // Delete comment
        function deleteComment(commentId) {
          if (!confirm('Delete this message?')) return;

          fetch(\`/topics/\${topicId}/comments/\${commentId}\`, {
            method: 'DELETE'
          }).then(res => {
            if (res.ok) {
              messages.delete(commentId);
              renderComments();
            } else {
              alert('Failed to delete comment');
            }
          }).catch(err => {
            console.error('Delete error:', err);
            alert('Error deleting comment');
          });
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
          // Connect WebSocket immediately (no dependencies)
          connectWebSocket();
          loadComments();

          // Setup UI features that depend on marked (preview, rendering)
          waitForMarked(() => {
            setupPreview();

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
  console.log('GET /ws called');
  try {
    const chat = c.env.CHAT;
    const chatDo = chat.get(chat.idFromName('global-chat'));
    const req = c.req.raw;
    console.log('Fetching DO with request:', req.method, req.url);
    const response = await chatDo.fetch(req);
    console.log('DO returned response');
    return response;
  } catch (err: any) {
    console.error('WS error:', err.message);
    return c.text('Error: ' + err.message, 500);
  }
});

// IoT token validation helper
async function validateIoTToken(c: any): Promise<string | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const kv = c.env.IOT_KV;
  const deviceId = await kv.get(`iot:tokens:${token}`);

  return deviceId;
}

// Admin: Setup IoT tokens (dev/testing)
app.post('/admin/iot/setup-tokens', async (c) => {
  const isAdmin = c.get('isAdmin');
  const isDev = c.env.ENVIRONMENT === 'development' || c.req.header('X-Dev-Override') === 'true';

  if (!isAdmin && !isDev) {
    return c.json({ error: 'Only admins can setup tokens' }, 403);
  }

  const kv = c.env.IOT_KV;
  const tokens = [
    { token: 'iot-token-sensor-1', deviceId: 'sensor-lobby-1' },
    { token: 'iot-token-charger-1', deviceId: 'charger-parking-1' },
    { token: 'iot-token-lock-1', deviceId: 'lock-door-1' },
    { token: 'iot-token-counter-1', deviceId: 'counter-inventory-1' }
  ];

  try {
    for (const entry of tokens) {
      await kv.put(`iot:tokens:${entry.token}`, entry.deviceId);
    }
    return c.json({ ok: true, tokens_created: tokens.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// IoT endpoints
app.post('/ingest', async (c) => {
  try {
    // Validate bearer token
    const deviceId = await validateIoTToken(c);
    if (!deviceId) {
      return c.json({ error: 'Unauthorized: invalid or missing bearer token' }, 401);
    }

    const iotHub = c.env.IOT_HUB;
    const iotDo = iotHub.get(iotHub.idFromName('iot-hub'));
    const body = await c.req.json();
    const msgId = crypto.randomUUID();

    // Verify device_id matches token
    if (body.device_id && body.device_id !== deviceId) {
      return c.json({ error: 'Unauthorized: device_id mismatch' }, 401);
    }

    // Use token's device_id if not provided in payload
    const finalDeviceId = body.device_id || deviceId;

    // Store in D1
    const db = c.env.DB;
    await db
      .prepare('INSERT INTO iot_messages (id, device_id, payload, timestamp) VALUES (?, ?, ?, ?)')
      .bind(msgId, finalDeviceId, JSON.stringify(body), new Date().toISOString())
      .run();

    // Broadcast via DO
    const req = new Request('http://internal/ingest', {
      method: 'POST',
      body: JSON.stringify({
        id: msgId,
        device_id: finalDeviceId,
        payload: body,
        timestamp: new Date().toISOString()
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    await iotDo.fetch(req);

    return c.json({ ok: true, device_id: finalDeviceId, msg_id: msgId }, 200);
  } catch (err: any) {
    console.error('Ingest error:', err);
    return c.json({ error: err.message }, 500);
  }
});

app.get('/subscribe', async (c) => {
  try {
    // Validate bearer token
    const deviceId = await validateIoTToken(c);
    if (!deviceId) {
      return c.json({ error: 'Unauthorized: invalid or missing bearer token' }, 401);
    }

    const iotHub = c.env.IOT_HUB;
    const iotDo = iotHub.get(iotHub.idFromName('iot-hub'));
    const req = c.req.raw;
    const response = await iotDo.fetch(req);
    return response;
  } catch (err: any) {
    console.error('Subscribe error:', err.message);
    return c.text('Error: ' + err.message, 500);
  }
});

export default app;
export { GlobalChat, IotHub };
