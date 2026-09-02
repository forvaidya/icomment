import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  LAPTOP_BACKEND_MTLS: {
    fetch(request: Request | string, init?: any): Promise<Response>;
  };
}

export const onRequestGet: PagesFunction = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const response = await fetch(
    `https://knuth.awanipro.com:9000/multiply?${url.searchParams.toString()}`
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' }
  });
};
