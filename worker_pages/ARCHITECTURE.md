# Public Pages and Private Workers

## ⚠️ TypeScript is Non-Negotiable

**You cannot use this architecture without TypeScript.**

Understanding TypeScript is the foundation for everything here:
- Type safety catches bugs at compile time
- Interfaces define contracts (like `Env`, `Fetcher`)
- Type checking prevents runtime errors
- IDE autocomplete requires types

**Before proceeding, learn TypeScript:**
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) (official)
- [Cloudflare TypeScript Guide](https://developers.cloudflare.com/workers/tooling/typescript/)

Focus on:
- Interfaces and types
- Type annotations
- Generics
- Type safety benefits

---

## Platform & Language Note

**This is a Cloudflare-specific implementation.**

- **Pages + Workers API layer:** TypeScript/JavaScript (Cloudflare platform requirement)
- **Backend business logic:** Any language (runs on your own servers)
- **Pattern itself:** Universal (works on any platform: AWS, Azure, Python, Go, Rust, etc.)

**Key constraint:** You cannot mix languages within Cloudflare Workers. The private Worker (`aspire-math`) must be TypeScript/JavaScript.

**However:** If you want `aspire-math` in Python:
1. Run it on your own server (not Cloudflare)
2. Call it via HTTP from the BFF: `fetch('https://your-python-server/calculate')`
3. Trade-off: Slightly slower & requires authentication, but language-agnostic

**Current implementation:**
```
Pages (TS) → Service Binding (internal) → aspire-math Worker (TS)
```

**Alternative (Python backend):**
```
Pages (TS) → HTTP call (external) → aspire-math (Python on your server)
```

If you're learning the pattern to apply elsewhere:
- The architecture is platform-agnostic
- The TypeScript requirement applies only to Cloudflare Workers
- Python, Go, Rust, etc. can implement the same pattern with different tools

---

## Preamble

Cloudflare is a serverless platform. Because Cloudflare Workers, Pages, and its other infrastructure provide less control over network topology than platforms such as AWS and GCP, many tutorials expose Workers through public routes.

Many tutorials overlook the practical requirement to protect the API while keeping the frontend publicly reachable.

This paper presents an alternative: keep presentation on public Pages and backend capabilities in Workers with no public route, reachable only through Service Bindings.

The frontend can use an identity provider such as [Clerk](https://clerk.com/) or [Auth0](https://auth0.com/), keeping customer authentication separate from private service connectivity.

## Intent

Use public Pages for presentation and private Workers for business capabilities. Private Workers have no public `workers.dev` hostname or route; their only entry point is a Service Binding from a trusted caller.

This separates responsibilities:

- Pages owns presentation: HTML, JavaScript, CSS, images, and browser delivery.
- Workers own decisions: business logic, calculations, database access, secrets, validation, and integrations.

## Topology

![Public Pages and private Workers architecture](architecture.png)

[Open the architecture diagram as a PNG](architecture.png)


The private Worker is analogous to a service in a private subnet. This is an architectural analogy, not a literal private network: the Worker is isolated by the absence of public ingress and by Service Binding access control.

## Request Flow

1. A browser requests the static Pages site.
2. Pages returns the frontend assets from the edge.
3. The frontend calls the browser-facing BFF endpoint when it needs data or a business operation.
4. The BFF invokes the private Worker through a Service Binding.
5. The private Worker performs the calculation or business decision.
6. The result travels back through the BFF to the browser.

The browser never calls `aspire-math` directly and never needs to know its internal Worker identity.

## Ingress Rules

The private Worker must remain configured with:

See the [aspire-math Worker configuration](workers/aspire-math/wrangler.toml).

- `workers_dev = false`
- no `routes` entry
- no public custom domain
- no direct browser-facing endpoint

Deployment is still possible without a route. Deployment publishes the Worker version, but it does not publish a public URL. The Worker is then available to configured Service Binding callers.

## Why Service Binding

A [Service Binding](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/service-bindings/) is the connection between the Pages-side BFF and the private Worker. It provides:

(See [FETCHER_EXPLAINED.md](FETCHER_EXPLAINED.md) for how Fetcher—the TypeScript interface for Service Bindings—is implemented.)

- an explicit caller relationship
- Worker-to-Worker communication without public DNS
- no CORS requirement between the internal services
- a small and intentional trust boundary
- independent deployment of the Pages project and private Worker

The binding name is part of the caller's configuration. In this system the intended name is `ASPIRE_MATH` and it points to the Worker service `aspire-math`.

See the [Pages Service Binding configuration](pages/wrangler.toml).

## Why `workers_dev = false`

By default, Cloudflare deploys Workers with a public `workers.dev` hostname. This creates an unintended public route to your business logic.

Setting [`workers_dev = false`](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) **disables the public hostname entirely**. The Worker:
- has no `workers.dev` URL
- has no public route
- cannot be reached from the Internet
- is reachable only through explicit Service Bindings

**This is the core motivation** for separating Pages (public) and Workers (private). Without `workers_dev = false`, you're forced to either expose business logic publicly or route everything through a BFF anyway. With it, you get:

1. True network isolation (no public endpoint exists)
2. Explicit trust boundaries (only configured callers can invoke)
3. Simplified security model (no need to protect a public route)
4. Dependency clarity (which services call which)

See the [aspire-math Worker configuration](workers/aspire-math/wrangler.toml) with `workers_dev = false`.

## Security: MTLS vs Service Binding

**Service Binding (this architecture):**
- Internal to Cloudflare (within same platform)
- No MTLS needed—Cloudflare handles trust internally
- Secure by architecture (no public endpoint)

**External machine-to-machine (IoT, webhooks, external services):**
- [Mutual TLS (mTLS)](https://developers.cloudflare.com/workers/runtime-apis/mtls-client-auth/) **is essential**
- Device or external service must authenticate to Worker
- Worker must authenticate to external service
- Example: IoT device → Cloudflare Worker (mTLS required)

**When MTLS matters:**
- IoT devices ingesting data to Workers
- External service webhooks
- Database connections over untrusted networks
- Service-to-service authentication (outside Cloudflare)

See [Cloudflare mTLS documentation](https://developers.cloudflare.com/workers/runtime-apis/mtls-client-auth/).

## Tokens and JWTs

Service Bindings remove the need to expose the private Worker through a public route. They do not make application authorization unnecessary.

Use Service Bindings for network reachability and service identity. Use Service Tokens, JWTs, or application authentication when the business operation needs user identity, authorization, tenant isolation, auditing, or defense in depth.

These concerns are separate:

- No route: the private Worker has no public ingress.
- Service Binding: an allowed Worker can invoke it internally.
- JWT or service token: the caller or operation can be authenticated and authorized.
- WAF: public Pages traffic can be filtered, including geographic restrictions.
- Clerk/Auth0: public B2C users can sign in to the application.
- Access: optional protection for private tools, tunnels, and administration.

## Public B2C Boundary

For a public-facing application, customer authentication belongs at the application boundary, using Clerk, Auth0, or another application identity provider. Cloudflare Access is optional and should be reserved for private infrastructure or administration.

A public Pages site may use a WAF rule to allow only selected countries, such as India, before requests consume application resources. This is independent of the private Worker design.

## Important Limitation

A purely static browser page cannot call a private Service Binding directly. Service Bindings are available to Worker runtimes, not to browser JavaScript.

Therefore, one of these must exist between the browser and the private Worker:

- a Pages Function acting as a BFF (receives `Fetcher` bindings via environment)
- a separate public BFF Worker
- a server-rendered or server-handled application endpoint

A Pages Function receives Service Bindings as `Fetcher` type environment variables. The `Fetcher` API provides a `.fetch()` method for Worker-to-Worker communication. See [Pages Functions](pages/functions/api/add.ts) and the [Fetch API documentation](https://developers.cloudflare.com/workers/runtime-apis/fetch/).

That browser-facing endpoint is publicly routable and must be protected with application authentication, rate limiting, validation, and WAF controls. The sensitive business Worker remains private behind it.

## Architectural Rule

> Keep presentation public and business capabilities private. Give the private Worker no public route. Connect it only through explicit Service Bindings. Put user authentication and public traffic controls at the browser-facing boundary.

## Current Aspire Shape

```text
worker_pages/
  pages/
    index.html
    functions/       browser-facing BFF functions
    wrangler.toml    Pages configuration

  workers/
    aspire-math/
      src/           private business Worker
      wrangler.toml  workers_dev = false
```

This allows the frontend and private business services to evolve and deploy independently while keeping the public/private boundary visible in the repository.
