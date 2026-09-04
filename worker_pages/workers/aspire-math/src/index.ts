interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  LAPTOP_BACKEND_MTLS: Fetcher;
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
