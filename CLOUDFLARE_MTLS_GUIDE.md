# Cloudflare Pages to AWS EC2 Backend with mTLS

Complete guide for connecting Cloudflare Pages to an mTLS-protected backend on AWS EC2.

## Architecture

```
Laptop (dev)
├── Generate certificates (CA, client, server)
├── Test with curl (positive/negative cases)
└── Git version control

AWS EC2 (backend)
├── Host backend service (knuth, FastAPI, etc.)
├── Configure HTTPS + mTLS
├── Require client certificates
└── Listen on private port (e.g., 9000)

Cloudflare Pages (frontend)
├── Upload mTLS certificates
├── Bind certificate to Pages Functions
├── Use binding's fetch() method
└── Call backend with auto client cert
```

## Prerequisites

### Laptop Setup

```bash
# Generate CA, server cert, and client cert
openssl genrsa -out ca-key.pem 2048
openssl req -new -x509 -days 365 -key ca-key.pem -out ca-cert.pem \
  -subj "/CN=laptop-backend-ca"

# Server cert (signed by CA)
openssl genrsa -out server-key.pem 2048
openssl req -new -key server-key.pem -out server.csr \
  -subj "/CN=knuth.awanipro.com"
openssl x509 -req -days 365 -in server.csr \
  -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
  -out server-cert.pem \
  -addext "subjectAltName=DNS:knuth.awanipro.com,IP:15.206.133.75"

# Client cert (for Cloudflare to use)
openssl genrsa -out client-key.pem 2048
openssl req -new -key client-key.pem -out client.csr \
  -subj "/CN=cloudflare-client"
openssl x509 -req -days 365 -in client.csr \
  -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
  -out client-cert.pem
```

### AWS EC2 Setup

- Instance running backend service (Python, Node.js, etc.)
- Security group: Allow port 9000 (or your port)
- Domain with DNS pointing to instance (or use IP)

## Backend Configuration (Python/FastAPI Example)

```python
import ssl
import uvicorn
from fastapi import FastAPI

app = FastAPI()

@app.get("/multiply")
async def multiply(a: float, b: float):
    return {"a": a, "b": b, "result": a * b}

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=9000,
        ssl_keyfile="certs/out/server-key.pem",
        ssl_certfile="certs/out/server-cert.pem",
        ssl_ca_certs="certs/out/ca-cert.pem",
        ssl_cert_reqs=ssl.CERT_REQUIRED,  # Require client certs
        log_level="info"
    )
```

## Cloudflare Setup

### 1. Upload mTLS Certificate

```bash
cd /path/to/certs

# Upload client cert to Cloudflare
wrangler mtls-certificate upload --cert client-cert.pem --key client-key.pem

# Note the returned certificate ID
# Example: 56964753-03ed-4f3e-89b3-89873425d0ed
```

### 2. Configure wrangler.toml

```toml
name = "your-pages-project"
compatibility_date = "2026-08-30"

# mTLS Certificate Binding
[[mtls_certificates]]
binding = "BACKEND_MTLS"
certificate_id = "56964753-03ed-4f3e-89b3-89873425d0ed"
```

### 3. Implement Pages Function

**CRITICAL:** Use `context.env.BINDING.fetch()`, NOT global `fetch()`

```typescript
import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  BACKEND_MTLS: {
    fetch(request: Request | string, init?: any): Promise<Response>;
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ 
  request, 
  context 
}: { 
  request: Request; 
  context: any;
}) => {
  const url = new URL(request.url);
  
  // Use binding's fetch to apply mTLS certificate
  const response = await context.env.BACKEND_MTLS.fetch(
    `https://your-backend-domain:9000/multiply?${url.searchParams.toString()}`
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

## Testing

### From Laptop (Positive Case - With Client Cert)

```bash
curl -i \
  --cert certs/out/client-cert.pem \
  --key certs/out/client-key.pem \
  --cacert certs/out/ca-cert.pem \
  'https://your-backend:9000/multiply?a=7&b=8'

# Expected: HTTP/1.1 200 OK
# Response: {"a":7.0,"b":8.0,"result":56.0}
```

### From Laptop (Negative Case - Without Client Cert)

```bash
timeout 3 curl -v 'https://your-backend:9000/multiply?a=7&b=8' 2>&1 | \
  grep -E "Connection reset|SSL|certificate"

# Expected: Connection reset by peer
# (Server rejects connection without valid client cert)
```

### From Cloudflare Pages

```
https://your-pages-project.pages.dev/api/multiply?a=3&b=4

# Expected: 200 OK with result
# Cloudflare automatically uses mTLS binding
```

## Troubleshooting

### 520 Error from Cloudflare

**Cause:** Using global `fetch()` instead of binding's fetch method

**Fix:** Use `context.env.BINDING_NAME.fetch()` instead

```typescript
// ❌ Wrong - ignores binding
const response = await fetch('https://...');

// ✅ Correct - uses mTLS binding
const response = await context.env.BACKEND_MTLS.fetch('https://...');
```

### Certificate Not Found

Verify certificate is uploaded:
```bash
wrangler mtls-certificate list
```

Verify certificate ID in wrangler.toml matches.

### TLS Handshake Failures

1. **Verify server cert is valid:**
   ```bash
   openssl s_client -connect your-backend:9000 -showcerts
   ```

2. **Check SAN matches domain/IP:**
   ```bash
   openssl x509 -in server-cert.pem -text -noout | grep -A 1 "Alternative"
   ```

3. **Verify CA cert chain:**
   Client should trust the CA that signed server cert.

### Connection Refused

- Check port 9000 is open in security group
- Verify backend is running: `ps aux | grep your-app`
- Check backend is listening: `netstat -tlnp | grep 9000`

## Production Considerations

### Security

1. **Rotate certificates** periodically
2. **Use strong keys** (2048+ bits recommended)
3. **Short expiration** (90 days recommended for client certs)
4. **Monitor cert expiration** — set calendar reminders
5. **Pin certificates** in code if possible
6. **Add rate limiting** on backend
7. **Log all mTLS connections** for audit

### High Availability

```
Cloudflare Pages
├── Multi-region deployment (auto)
└── Multiple backends (consider):
    ├── Load balancer in front of EC2 instances
    ├── OR Route 53 for DNS failover
    └── All backends share same CA
```

### Monitoring

```bash
# On EC2, monitor certificate expiration
openssl x509 -in server-cert.pem -noout -dates

# On laptop, test connection periodically
curl https://your-backend:9000/health
```

## Design Decision: Direct mTLS vs Tunnel

### Original Design: Cloudflare Tunnel
- Tunnel wraps backend (private)
- Cloudflare Access controls access
- **Issue:** Tunnel doesn't validate mTLS, doesn't check client certs

### Chosen Solution: Direct mTLS Binding
- Cloudflare directly calls backend with client certs
- Full mutual TLS verification (client ↔ server)
- **Advantage:** Enforces certificate-based auth at connection level
- **Use case:** Enterprise APIs requiring certificate validation

Both approaches work; direct mTLS is chosen when backend explicitly requires client cert verification.

## Key Learning

**Critical Discovery:** Cloudflare mTLS binding only works when using the binding's fetch method:

```javascript
// This works (binding applies certificate):
await context.env.MY_BINDING.fetch(url)

// This doesn't work (binding ignored):
await fetch(url)
```

This enables:
- ✅ Salesforce API (mTLS required)
- ✅ Workday API (mutual auth)
- ✅ Banking APIs (certificate-based)
- ✅ Any enterprise API requiring client certs

## Example: Complete Flow

1. **Setup:** Generate certs, configure backend with mTLS
2. **Deploy:** Upload certs to Cloudflare, configure binding
3. **Implement:** Use `context.env.BINDING.fetch()` in Pages
4. **Test:** Curl from laptop (positive/negative cases)
5. **Monitor:** Track certificate expiration

## References

- [Cloudflare Workers mTLS](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/mtls-certificates/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)
- [Let's Encrypt Certificates](https://letsencrypt.org/)
- [OpenSSL Certificate Generation](https://www.openssl.org/docs/man1.1.1/man1/req.html)

---

**Status:** Production Ready ✅
**Last Updated:** 2026-09-02
**Contributors:** Claude + User
