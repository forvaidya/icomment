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

app.use('*', async (c, next) => {
  const token = c.req.header('Cf-Access-Jwt-Assertion');

  if (!token) {
    return c.json({ error: 'Missing CF Access JWT' }, 401);
  }

  const claims = decodeJWT(token);
  if (!claims) {
    return c.json({ error: 'Invalid JWT' }, 401);
  }

  c.set('user', { sub: claims.sub, email: claims.email });
  await next();
});

app.get('/', (c) => {
  const user = c.get('user');
  return c.json({
    message: 'Hello from psychomments',
    jwt_claims: user,
  });
});

export default app;
