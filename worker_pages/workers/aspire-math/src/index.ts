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
        console.log(JSON.stringify({
          event: 'multiply.upstream.request',
          requestId,
          origin: 'knuth.awanipro.com:9000',
          tls: true,
          mtlsBinding: 'LAPTOP_BACKEND_MTLS'
        }));

        const response = await env.LAPTOP_BACKEND_MTLS.fetch(
          `https://knuth.awanipro.com:9000/multiply?${url.searchParams.toString()}`
        );

        console.log(JSON.stringify({
          event: 'multiply.upstream.response',
          requestId,
          status: response.status,
          contentType: response.headers.get('Content-Type'),
          durationMs: Date.now() - startedAt
        }));

        return new Response(response.body, {
          status: response.status,
          headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' }
        });
      } catch (error) {
        console.error(JSON.stringify({
          event: 'multiply.upstream.error',
          requestId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt
        }));

        return Response.json(
          {
            error: 'Upstream request failed',
            requestId
          },
          { status: 502 }
        );
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
