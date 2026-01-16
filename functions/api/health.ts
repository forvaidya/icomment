/**
 * Health check endpoint
 * GET /api/health
 *
 * Returns system health status including:
 * - API status (ok/down)
 * - Database connectivity
 * - KV Store connectivity
 * - System timestamp and version
 */

export interface HealthCheckResponse {
  success: boolean;
  data: {
    status: 'ok' | 'degraded' | 'down';
    timestamp: string;
    version: string;
    environment: 'development' | 'production' | 'staging';
    checks: {
      database: boolean;
      kvStore: boolean;
    };
  };
}

/**
 * Handle health check requests
 * Never rate-limited, no authentication required
 */
export async function onRequest(
  context: EventContext<
    {
      db: D1Database;
      kv: KVNamespace;
    },
    string,
    unknown
  >
): Promise<Response> {
  const { db, kv } = context.env;
  const timestamp = new Date().toISOString();
  const environment = (context.env.ENV || 'development') as
    | 'development'
    | 'production'
    | 'staging';

  let dbHealthy = false;
  let kvHealthy = false;

  // Check database connectivity
  try {
    const result = await db.prepare('SELECT 1').first();
    dbHealthy = result !== null;
  } catch (error) {
    console.error('Database health check failed:', error);
    dbHealthy = false;
  }

  // Check KV Store connectivity
  try {
    const testKey = `health_check:${Date.now()}`;
    await kv.put(testKey, 'ok', { expirationTtl: 10 });
    const value = await kv.get(testKey);
    kvHealthy = value === 'ok';
    await kv.delete(testKey);
  } catch (error) {
    console.error('KV Store health check failed:', error);
    kvHealthy = false;
  }

  const allHealthy = dbHealthy && kvHealthy;
  const status: 'ok' | 'degraded' | 'down' = allHealthy
    ? 'ok'
    : dbHealthy || kvHealthy
      ? 'degraded'
      : 'down';

  const healthResponse: HealthCheckResponse = {
    success: true,
    data: {
      status,
      timestamp,
      version: '0.1.0',
      environment,
      checks: {
        database: dbHealthy,
        kvStore: kvHealthy,
      },
    },
  };

  const statusCode = status === 'ok' ? 200 : 503;

  return new Response(JSON.stringify(healthResponse), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
