import { Hono } from 'hono';
import type { HonoRequest } from 'hono';

type Env = {
  Variables: {
    user: Record<string, unknown>;
  };
  Bindings: {
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

app.get('/', (c) => {
  const token = c.req.header('Cf-Access-Jwt-Assertion');
  const claims = token ? decodeJWT(token) : null;

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
        .jwt-info { background: #e7f3ff; padding: 15px; border-radius: 4px; margin: 20px 0; font-family: monospace; }
        .success { color: #155724; }
        .info { color: #004085; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ Psychomments Worker is Running</h1>
        <p style="font-size: 20px; margin: 15px 0;">🐱 Jolly the cat</p>

        <div class="status">
          <strong class="success">✓ Worker deployed successfully</strong>
          <p>Your Cloudflare Worker is live and responding to requests.</p>
        </div>

        <div class="jwt-info">
          <strong class="info">JWT Info:</strong>
          <p>${claims ? JSON.stringify(claims, null, 2) : 'No JWT token in request'}</p>
        </div>

        <div style="margin-top: 20px; color: #666;">
          <p><strong>Ready for:</strong></p>
          <ul>
            <li>✓ Step 01: Worker + CF Access ✅</li>
            <li>→ Step 02: D1 CRUD (coming next)</li>
            <li>→ Step 03: Hono Router</li>
            <li>→ Step 04-06: DO, WebSocket, R2</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `;

  return c.html(html);
});

export default app;
