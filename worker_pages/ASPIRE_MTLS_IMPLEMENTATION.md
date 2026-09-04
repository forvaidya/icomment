# Aspire mTLS Implementation

Securing API calls from Cloudflare Pages/Workers to AWS backend

## 1. Goal: Why mTLS for Aspire

**Problem:** How do we ensure the Worker is calling the _correct version_ of the API? Without authentication, network misconfiguration or DNS changes could silently route to the wrong endpoint.

**Solution:** mTLS makes the API's identity cryptographically verified. The Worker presents a client certificate; the backend verifies it and only accepts authenticated requests.

## 2. Infrastructure: Architecture

```
Cloudflare Pages (UI)
    ↓ binding
Cloudflare Worker (aspire-math)
    ├─ /add → compute locally ✓
    └─ /multiply → AWS with mTLS
                ↓
        AWS EC2 :9000
        (requires client cert)
```

### AWS Backend

- **Instance:** EC2 on public subnet
- **Ingress:** Port 9000 (wide open for testing)
- **IP:** Elastic IP for stable addressing
- **SSL:** Let's Encrypt certificate
- **mTLS:** Requires valid client certificate

### Cloudflare Setup

- **Pages:** aspire-pages (UI)
- **Worker:** aspire-math (private service)
- **Binding:** Pages → Worker via ASPIRE_MATH
- **mTLS Cert:** Uploaded to Worker binding

### DNS Configuration

**Critical:** ANAME records must be **Gray Cloud** (DNS only), not Orange Cloud (proxied).

- **Orange Cloud:** Cloudflare proxies the connection → mTLS happens between Worker and Cloudflare, not backend → _fails_
- **Gray Cloud:** Cloudflare passes DNS through → Worker connects directly to backend → _works_

## 3. Certificates: Certificate Setup

### Generation

```bash
# Create CA
openssl genrsa -out ca-key.pem 2048
openssl req -new -x509 -days 365 -key ca-key.pem -out ca-cert.pem

# Create client cert
openssl genrsa -out client-key.pem 2048
openssl req -new -key client-key.pem -out client.csr
openssl x509 -req -in client.csr -CA ca-cert.pem -CAkey ca-key.pem -out client-cert.pem -days 365
```

### Deployment

- **git:** Client cert pair committed (for reproducibility)
- **Cloudflare:** Uploaded to Worker as mTLS binding
- **Binding name:** LAPTOP_BACKEND_MTLS

## 4. Testing: Verification

### Direct Test (laptop)

```bash
# Without cert (rejected)
$ curl https://knuth.awanipro.com:9000/multiply?a=4&b=5
curl: (52) Empty reply from server

# With cert (success)
$ curl --cert client-cert.pem --key client-key.pem \
       https://knuth.awanipro.com:9000/multiply?a=4&b=5
{"a":4.0,"b":5.0,"result":20.0}
```

### Through Pages/Worker

Pages function calls Worker at `https://aspire-math/multiply`. Worker presents client cert to backend. Result:

```
GET /api/multiply?a=4&b=5
→ Pages function → Worker binding → AWS with mTLS
← 200 OK, {"a":4.0,"b":5.0,"result":20.0}
```

**Status:** ✓ mTLS verified. Both direct and proxied paths work. API identity is cryptographically confirmed.

## 5. Key Learnings: Implementation Insights

### Workers, Not Pages

**Only Workers can present client certificates.** Pages functions cannot. This is by design—Pages is for stateless requests. Workers have full TLS control.

Workaround: Pages calls Worker, Worker calls backend with mTLS.

### Gray Cloud Requirement

If DNS is proxied (Orange Cloud), mTLS fails because Cloudflare becomes a MITM. The handshake happens between Worker and Cloudflare, not between Worker and backend. Use Gray Cloud (DNS only).

### Bind at the Worker Level

The mTLS certificate binding lives in the Worker's `wrangler.toml`:

```toml
[[mtls_certificates]]
binding = "LAPTOP_BACKEND_MTLS"
certificate_id = "56964753-03ed-4f3e-89b3-89873425d0ed"
```

Pages functions access it via `env.ASPIRE_MATH.fetch()`, which internally uses the Worker's bindings.

### Error Handling

mTLS failures are silent on the surface (network timeout, 502, empty reply). Always:

- Check cert expiry: `openssl x509 -text -noout -in cert.pem`
- Verify DNS is Gray Cloud
- Test locally first (curl with cert)
- Check Worker logs for upstream errors

## 6. Summary: Result

Aspire now has end-to-end authenticated communication:

- **Pages UI:** Calls Cloudflare Worker via binding (authenticated by platform)
- **Worker:** Calls AWS backend via mTLS (client cert verified by backend)
- **Backend:** Only accepts requests from known clients (cert holders)

**Guarantee:** The multiply endpoint is talking to the _correct API_, not a misconfigured or malicious endpoint. Identity is cryptographic, not just DNS-based.

## Related Documentation

- **[System Architecture](./worker_pages/ARCHITECTURE.md)** — Pages, Worker, and backend topology
- **[Architecture (Beginner)](./worker_pages/ARCHITECTURE_BEGINNER.md)** — Simple overview of the system design
- **[Fetcher Interface](./worker_pages/FETCHER_EXPLAINED.md)** — How Pages and Workers communicate
- **[mTLS Binding Setup](./worker_pages/MTLS_BINDING_SETUP.md)** — Configuration details
- **[Multiply Feature](./worker_pages/MULTIPLY_FEATURE_COMPLETE.md)** — mTLS multiply endpoint implementation
