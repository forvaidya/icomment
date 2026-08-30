import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequestGet: PagesFunction = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);

  // TEST MODE: Call plain HTTP endpoint (no mTLS)
  // For production with mTLS, use env.LAPTOP_BACKEND_MTLS binding and https://
  const response = await fetch(
    `http://knuth.awanipro.com:9000/multiply?${url.searchParams.toString()}`,
    { method: 'GET' }
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' }
  });
};
