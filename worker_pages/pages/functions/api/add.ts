import type { Fetcher, PagesFunction } from '@cloudflare/workers-types';

/**
 * Pages Function environment binding for Service Binding to a private Worker.
 *
 * Service Bindings: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/service-bindings/
 * Fetch API: https://developers.cloudflare.com/workers/runtime-apis/fetch/
 * Fetcher interface: @cloudflare/workers-types (see https://github.com/cloudflare/workers-types)
 *
 * ASPIRE_MATH is a Fetcher interface that represents the private aspire-math Worker.
 * The Worker is configured with `workers_dev = false` to prevent public HTTP access.
 *
 * Key distinction:
 * - fetch() = standard Web API (global function for HTTP requests)
 * - Fetcher = Cloudflare Workers interface (type for Service Binding connections)
 *
 * @see https://developers.cloudflare.com/workers/configuration/compatibility-dates/ workers.dev configuration
 * @see ../wrangler.toml Service Binding configuration in Pages wrangler.toml
 * @see ../../workers/aspire-math/wrangler.toml Private Worker configuration (workers_dev = false)
 */
interface Env {
  /**
   * Fetcher interface: represents the Service Binding to aspire-math Worker.
   *
   * Fetcher implements the Fetch API, so you call it like:
   *   env.ASPIRE_MATH.fetch('https://aspire-math/path')
   *
   * No public route or workers.dev URL exists for this Worker.
   * It is reachable only through this Service Binding connection.
   */
  ASPIRE_MATH: Fetcher;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const response = await env.ASPIRE_MATH.fetch(
    `https://aspire-math/add?${url.searchParams.toString()}`
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' }
  });
};
