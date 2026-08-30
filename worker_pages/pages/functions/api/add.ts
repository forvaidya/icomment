/**
 * Pages Function environment binding for Service Binding to a private Worker.
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/web-crypto/service-bindings/ Service Bindings
 * @see https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#fetcher Fetcher API
 *
 * ASPIRE_MATH is a Fetcher that references the private aspire-math Worker.
 * The Worker is configured with `workers_dev = false` to prevent public HTTP access.
 *
 * @see https://developers.cloudflare.com/workers/configuration/compatibility-dates/ workers.dev configuration
 * @see ../wrangler.toml Service Binding configuration in Pages wrangler.toml
 * @see ../../workers/aspire-math/wrangler.toml Private Worker configuration (workers_dev = false)
 */
interface Env {
  /**
   * Service Binding to the private aspire-math Worker.
   * Call via: env.ASPIRE_MATH.fetch('https://aspire-math/path')
   *
   * No public route or workers.dev URL exists for this Worker.
   * It is reachable only through this Service Binding.
   */
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
