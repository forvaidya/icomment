interface Env {
  ASPIRE_MATH: Fetcher;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const response = await env.ASPIRE_MATH.fetch(
    `https://aspire-math/add?${url.searchParams.toString()}`
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' }
  });
};
