import { runRecipeAgent, type Ai, type Kv } from './meal';

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  first(column?: string): Promise<unknown>;
  all(): Promise<D1Result>;
}

interface D1Result {
  success: boolean;
  meta: { duration: number };
}

interface D1ExecResult {
  success: boolean;
  results: D1Result[];
}

interface Env {
  LAPTOP_BACKEND_MTLS: Fetcher;
  AI: Ai;
  DB?: D1Database;
  RECIPE_CACHE?: Kv;
  DEPLOYMENT_SHA?: string;
}

let circuitState = { failures: 0, lastFailure: 0, isOpen: false };

function checkCircuitBreaker(): boolean {
  const now = Date.now();
  const thirtySeconds = 30 * 1000;

  if (circuitState.isOpen) {
    const cooldownMs = 5 * 1000;
    if (now - circuitState.lastFailure > cooldownMs) {
      circuitState.isOpen = false;
      circuitState.failures = 0;
      return true;
    }
    return false;
  }

  if (now - circuitState.lastFailure > thirtySeconds) {
    circuitState.failures = 0;
  }

  return true;
}

function recordFailure(): void {
  circuitState.failures++;
  circuitState.lastFailure = Date.now();
  if (circuitState.failures >= 3) {
    circuitState.isOpen = true;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/deployment-info') {
      return Response.json({
        sha1: env.DEPLOYMENT_SHA || 'unknown',
        service: 'aspire-math-worker'
      }, { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/multiply') {
      const requestId = crypto.randomUUID();
      const startedAt = Date.now();
      const firstParameter = url.searchParams.get('a');
      const secondParameter = url.searchParams.get('b');

      console.log(JSON.stringify({
        event: 'multiply.request.received',
        requestId,
        method: request.method,
        path: url.pathname,
        hasA: firstParameter !== null,
        hasB: secondParameter !== null,
        userAgent: request.headers.get('User-Agent'),
        cfRay: request.headers.get('CF-Ray')
      }));

      if (firstParameter === null || secondParameter === null) {
        console.warn(JSON.stringify({
          event: 'multiply.request.invalid',
          requestId,
          reason: 'missing query parameter',
          durationMs: Date.now() - startedAt
        }));
      }

      if (!checkCircuitBreaker()) {
        console.warn(JSON.stringify({
          event: 'multiply.circuit_open',
          requestId,
          failures: circuitState.failures,
          durationMs: Date.now() - startedAt
        }));
        return Response.json({
          error: 'Circuit breaker open: backend temporarily unavailable',
          requestId
        }, { status: 503 });
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await env.LAPTOP_BACKEND_MTLS.fetch(
          `https://knuth.awanipro.com:9000/multiply?${url.searchParams.toString()}`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          recordFailure();
          console.warn(JSON.stringify({
            event: 'multiply.upstream.error',
            requestId,
            status: response.status,
            durationMs: Date.now() - startedAt
          }));
          return Response.json({
            error: `Backend error: HTTP ${response.status}`,
            requestId
          }, { status: 502 });
        }

        circuitState.failures = 0;
        console.log(JSON.stringify({
          event: 'multiply.upstream.response',
          requestId,
          status: response.status,
          durationMs: Date.now() - startedAt
        }));

        return new Response(response.body, response);
      } catch (e) {
        recordFailure();
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(JSON.stringify({
          event: 'multiply.upstream.error',
          requestId,
          error: errorMsg,
          durationMs: Date.now() - startedAt
        }));
        return Response.json({
          error: errorMsg,
          requestId
        }, { status: 502 });
      }
    }

    if (url.pathname === '/meal') {
      console.error('MEAL HANDLER CALLED');
      if (request.method !== 'POST') {
        return Response.json({ error: 'Only POST allowed' }, { status: 405 });
      }

      const requestId = crypto.randomUUID();
      const startedAt = Date.now();
      console.error(`MEAL START: ${requestId}`);

      try {
        const body = await request.json() as { query: string; diet: unknown; allergies: unknown; sessionId?: string; feedback?: string; logLevel?: string };
        const logLevel = body.logLevel || 'debug';
        const shouldLog = (level: string) => {
          const levels = ['error', 'info', 'debug'];
          return levels.indexOf(level) <= levels.indexOf(logLevel);
        };

        console.log(JSON.stringify({
          event: 'meal.request.payload',
          requestId,
          query: body.query,
          diet: body.diet,
          allergies: body.allergies,
          sessionId: body.sessionId,
          hasFeedback: !!body.feedback,
          logLevel
        }));

        const result = await runRecipeAgent(env.AI, body, requestId, env.RECIPE_CACHE, body.sessionId, body.feedback, logLevel, env.DB);
        if (!result) {
          return Response.json({ error: 'Model did not return a usable recipe', requestId }, { status: 500 });
        }

        console.log(JSON.stringify({
          event: 'meal.request.ok',
          requestId,
          durationMs: Date.now() - startedAt
        }));
        return Response.json({ ...result, requestId }, { status: 200 });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(JSON.stringify({
          event: 'meal.request.error',
          requestId,
          error: errorMsg,
          durationMs: Date.now() - startedAt
        }));
        return Response.json({
          error: errorMsg,
          requestId
        }, { status: 500 });
      }
    }

    if (url.pathname !== '/add') {
      return new Response('Not found', { status: 404 });
    }

    const firstParameter = url.searchParams.get('a');
    const secondParameter = url.searchParams.get('b');
    const firstValue = firstParameter === null ? NaN : Number(firstParameter);
    const secondValue = secondParameter === null ? NaN : Number(secondParameter);

    if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) {
      return Response.json(
        { error: 'Query parameters a and b must be valid numbers' },
        { status: 500 }
      );
    }

    return Response.json(
      { a: firstValue, b: secondValue, result: firstValue + secondValue },
      { status: 200 }
    );
  }
};
