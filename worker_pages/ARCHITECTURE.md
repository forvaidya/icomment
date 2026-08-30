# Public Pages and Private Workers

## Preamble

Cloudflare is a serverless platform. At least on the free tier, it does not provide the kind of VPC controls that let an operator design and manage a conventional network topology. Many Cloudflare blueprints and tutorials therefore expose Workers through public routes.

This paper explores an alternative way to establish a proper frontend-to-backend connection: keep the presentation layer on publicly routable Pages, while keeping backend capabilities in Workers that have no public route and can be reached only through Service Bindings.

The frontend can also be protected with an identity provider such as [Clerk](https://clerk.com/) or [Auth0](https://auth0.com/). This separates customer authentication from private service connectivity and keeps each concern in the layer where it belongs.

## Intent

Use publicly routable Cloudflare Pages for presentation and private Cloudflare Workers for business capabilities.

The frontend should be easy for a browser to reach. The business Worker should not be reachable from the public Internet. It should have no public `workers.dev` hostname and no public route. The only supported entry point should be a Service Binding from an explicitly trusted caller.

This keeps the system divided into two clear responsibilities:

- Pages owns presentation: HTML, JavaScript, CSS, images, and browser delivery.
- Workers own decisions: business logic, calculations, database access, secrets, validation, and integrations.

## Topology

```text
Internet
   |
   v
Cloudflare Pages
(public static presentation)
   |
   v
Pages Function or BFF facade
(public browser-facing boundary)
   |
   | ASPIRE_MATH Service Binding
   v
Private Worker: aspire-math
(no public route, no workers.dev URL)
```

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

- `workers_dev = false`
- no `routes` entry
- no public custom domain
- no direct browser-facing endpoint

Deployment is still possible without a route. Deployment publishes the Worker version, but it does not publish a public URL. The Worker is then available to configured Service Binding callers.

## Why Service Binding

A Service Binding is the connection between the Pages-side BFF and the private Worker. It provides:

- an explicit caller relationship
- Worker-to-Worker communication without public DNS
- no CORS requirement between the internal services
- a small and intentional trust boundary
- independent deployment of the Pages project and private Worker

The binding name is part of the caller's configuration. In this system the intended name is `ASPIRE_MATH` and it points to the Worker service `aspire-math`.

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

- a Pages Function acting as a BFF
- a separate public BFF Worker
- a server-rendered or server-handled application endpoint

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
