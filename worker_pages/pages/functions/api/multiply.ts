import type { Fetcher, PagesFunction } from '@cloudflare/workers-types';

interface Env {
  LAPTOP_BACKEND_MTLS: Fetcher;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  try {
    const response = await env.LAPTOP_BACKEND_MTLS.fetch(
      `https://knuth.awanipro.com:9000/multiply?${url.searchParams.toString()}`
    );

    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('mTLS origin request failed', error);

    return Response.json(
      {
        error: 'mTLS origin request failed',
        bindingExists: Boolean(env.LAPTOP_BACKEND_MTLS)
      },
      { status: 502 }
    );
  }
};
