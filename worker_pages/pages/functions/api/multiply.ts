import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequestGet: PagesFunction = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  // Calls knuth backend via LAPTOP_BACKEND_MTLS binding (auto-applies client cert)
  const response = await fetch(
    `https://knuth.awanipro.com:9000/multiply?${url.searchParams.toString()}`
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' }
  });
};
