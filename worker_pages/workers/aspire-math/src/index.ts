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
      try {
        const response = await env.LAPTOP_BACKEND_MTLS.fetch(
          `https://knuth.awanipro.com:9000/multiply?${url.searchParams.toString()}`
        );

        return new Response(response.body, {
          status: response.status,
          headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' }
        });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'Upstream request failed' },
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
