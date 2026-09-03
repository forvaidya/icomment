interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  LAPTOP_BACKEND_MTLS: Fetcher;
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

      try {
        const response = await env.LAPTOP_BACKEND_MTLS.fetch(
          `https://knuth.awanipro.com:9000/multiply?${url.searchParams.toString()}`
        );

        if (!response.ok) {
          console.warn(JSON.stringify({
            event: 'multiply.upstream.error',
            requestId,
            status: response.status,
            durationMs: Date.now() - startedAt
          }));
          return new Response(`Backend error: ${response.status}`, { status: 502 });
        }

        console.log(JSON.stringify({
          event: 'multiply.upstream.response',
          requestId,
          status: response.status,
          durationMs: Date.now() - startedAt
        }));

        return new Response(response.body, response);
      } catch (e) {
        console.error(JSON.stringify({
          event: 'multiply.upstream.error',
          requestId,
          error: e instanceof Error ? e.message : String(e),
          durationMs: Date.now() - startedAt
        }));
        return new Response(`mTLS fetch failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 });
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
