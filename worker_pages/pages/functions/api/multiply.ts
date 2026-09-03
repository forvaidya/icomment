import type { Fetcher, PagesFunction } from '@cloudflare/workers-types';

interface Env {
  ASPIRE_MATH: Fetcher;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const response = await env.ASPIRE_MATH.fetch(
    `https://aspire-math/multiply?${url.searchParams.toString()}`
  );

  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' }
  });
};