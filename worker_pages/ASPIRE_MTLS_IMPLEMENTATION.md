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

## 5b. Certificate Revocation: CRL Support

### What is CRL?

**Certificate Revocation List (CRL)** is a list of certificate serial numbers that have been revoked before expiry. When a certificate is compromised or no longer trusted, it's added to the CRL to prevent further use.

Flow:
```
1. Client presents certificate during TLS handshake
2. Server checks if cert serial is in CRL
3. If revoked: reject connection
4. If valid: allow connection
```

### Why CRL for Aspire?

- **Compromise:** If client cert is leaked, revoke it immediately without waiting for expiry
- **Rotation:** Decommission old certs without maintaining multiple CA hierarchies
- **Emergency:** Block specific clients in real-time

### Implementation: Where CRL Works

**❌ NOT in FastAPI/Python application:**
- HTTP middleware runs *after* TLS handshake
- Framework has no access to raw certificate data
- Same limitation applies to all HTTP frameworks (Hono, Express, etc.)

**✅ Works at infrastructure level:**

#### AWS ALB + WAF
```
Client cert → ALB TLS listener → ALB checks CRL → Accept/Reject
```
ALB native support for client certificate validation with CRL.

#### Nginx Reverse Proxy
```
client cert → nginx → load_verify_file crl.pem → upstream
```
Nginx configuration:
```nginx
server {
    listen 443 ssl;
    ssl_certificate server-cert.pem;
    ssl_certificate_key server-key.pem;
    ssl_client_certificate ca-cert.pem;
    ssl_crl crl.pem;  # ← CRL checking here
    ssl_verify_client on;
    
    location / {
        proxy_pass http://upstream:9000;
    }
}
```

#### AWS WAF + Mutual TLS
WAF rules can inspect client certificates and block based on serial number.

### Testing CRL Locally

Use the standalone validation script (no framework needed):

```bash
cd worker_pages/knuth

# Test with empty CRL (cert is valid)
./validate-crl.sh certs/out/client-cert.pem certs/out/crl-empty.pem
# ✅ VALID: Certificate ... NOT in CRL

# Test with revoked CRL
./validate-crl.sh certs/out/client-cert.pem certs/out/crl-revoked.pem
# ❌ REVOKED: Certificate ... is in CRL
```

Scripts shows:
- How to extract certificate serial number
- How to check if serial exists in CRL
- How revocation validation logic works

### CRL Files in Repo

```
worker_pages/knuth/certs/out/
├── crl.pem           # Active CRL (currently empty)
├── crl-empty.pem     # Backup: no revocations
├── crl-revoked.pem   # For testing: has cert revoked
└── ca-cert.pem       # CA certificate (used by ALB/nginx)
```

### Deployment Path

1. **Development:** Use `validate-crl.sh` to understand CRL logic
2. **Staging:** Deploy nginx with CRL checking in front of EC2
3. **Production:** Use ALB with native CRL support or WAF rules

### Regenerating CRL

When you need to revoke a new certificate:

```bash
cd worker_pages/knuth

# Create new CRL with cert revoked
# (requires cryptography library and CA private key)
python3 << 'EOF'
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from datetime import datetime, timedelta

# Load CA and cert to revoke
with open('certs/out/ca-cert.pem', 'rb') as f:
    ca_cert = x509.load_pem_x509_certificate(f.read(), default_backend())
with open('certs/out/ca-key.pem', 'rb') as f:
    ca_key = # Load private key...

# Create revocation entry and sign new CRL
# See crl-revoked.pem for structure
EOF

# Then copy to active:
cp certs/out/crl-revoked.pem certs/out/crl.pem
```

## 7. Reverse Proxy Pattern: Hono for CRL Checking

### Why Hono?

**Problem:** CRL checking must happen at TLS layer, not in HTTP frameworks.
- Python ASGI middleware: No access to client certificate
- Node.js https.Server: Direct access via `socket.getPeerCertificate()`

**Solution:** Node.js reverse proxy (Hono) handles:
- Incoming mTLS + certificate validation
- CRL lookup and revocation check
- Proxies to backend only if cert valid

```
Client (with cert)
    ↓ HTTPS + CRL check
Hono reverse proxy :9000 (Node.js)
    ↓ Internal HTTP (no TLS)
FastAPI backend :9001 (Python)
```

### Architecture Separation of Concerns

| Role | Responsibility | Location |
|------|---|---|
| **Edge Worker Author** | Write business logic | Cloudflare Worker |
| **API Administrator** | Manage certificates + CRL | Infrastructure (reverse proxy) |
| **Backend Developer** | Implement endpoints | Python FastAPI |

**Important:** Edge Worker author does NOT need to know about mTLS or CRL. That's infrastructure-level security, handled by API admin.

### CRL Management (API Admin Only)

Certificate revocation is an **infrastructure concern**, not application concern:

```bash
# API admin task:
cp /path/to/crl-revoked.pem /path/to/crl.pem
# Next request: certificate blocked, no restart needed
```

Worker doesn't care—it just calls the API. If cert is revoked, it gets 403.

---

## 6. Summary: Result

Aspire now has end-to-end authenticated communication:

- **Pages UI:** Calls Cloudflare Worker via binding (authenticated by platform)
- **Worker:** Calls AWS backend via mTLS (client cert verified by backend)
- **Backend:** Only accepts requests from known clients (cert holders)

**Guarantee:** The multiply endpoint is talking to the _correct API_, not a misconfigured or malicious endpoint. Identity is cryptographic, not just DNS-based.

## Related Documentation

- **[System Architecture](ARCHITECTURE.md)** — Pages, Worker, and backend topology
- **[Architecture (Beginner)](ARCHITECTURE_BEGINNER.md)** — Simple overview of the system design
- **[Fetcher Interface](FETCHER_EXPLAINED.md)** — How Pages and Workers communicate
- **[mTLS Binding Setup](MTLS_BINDING_SETUP.md)** — Configuration details
- **[Multiply Feature](MULTIPLY_FEATURE_COMPLETE.md)** — mTLS multiply endpoint implementation
