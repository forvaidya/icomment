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
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message,
      name: err.name,
      stack: err.stack,
      bindingExists: !!env.LAPTOP_BACKEND_MTLS,
      bindingType: typeof env.LAPTOP_BACKEND_MTLS
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
