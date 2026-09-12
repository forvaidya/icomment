interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  ASPIRE_MATH: Fetcher;
}

export const onRequestGet = async ({ request, env, params }: { request: Request; env: Env; params: { operation: string } }) => {
  const url = new URL(request.url);
  const operation = params.operation;

  const response = await env.ASPIRE_MATH.fetch(
    `https://aspire-math/${operation}?${url.searchParams.toString()}`,
    {
      headers: request.headers
    }
  );

  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' }
  });
};

export const onRequestPost = async ({ request, env, params }: { request: Request; env: Env; params: { operation: string } }) => {
  const operation = params.operation;

  const response = await env.ASPIRE_MATH.fetch(
    `https://aspire-math/${operation}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cf-Access-Authenticated-User-Email': request.headers.get('Cf-Access-Authenticated-User-Email') || '',
        ...Object.fromEntries(request.headers.entries())
      },
      body: await request.text()
    }
  );

  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' }
  });
};
