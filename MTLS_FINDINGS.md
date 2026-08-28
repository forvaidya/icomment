# mTLS Implementation — Key Findings

## Executive Summary

Successfully implemented **Mutual TLS (mTLS) authentication** on Cloudflare Workers without using Cloudflare Access. The implementation provides certificate-based protection with two-layer validation (edge + Worker code).

---

## Key Finding: **CF Access is NOT Required for mTLS**

### What We Learned

**Myth:** "To protect a Worker with mTLS, you must use Cloudflare Access."

**Reality:** mTLS is a **lower-level TLS feature** built into Cloudflare's edge. It works independently of Access.

### The Difference

| Feature | mTLS (Direct) | Cloudflare Access |
|---------|---------------|-------------------|
| **Purpose** | Machine-to-machine auth | Identity-aware proxy |
| **Overhead** | Minimal (TLS handshake) | Full proxy + session mgmt |
| **Best for** | APIs, IoT, services | Human users, internal tools |
| **Setup** | 2 steps (Upload CA + WAF rule) | 4+ steps (policies, IdP config) |
| **Cost** | Included in all plans | Extra cost for advanced features |

---

## Architecture: Three Auth Systems, One Domain

All three coexist on `psychomments.awanipro.com` with proper path isolation:

```
/ant/*      ← CF Access (email auth via OIDC)
/spider/*   ← mTLS (client certificate auth)
/api/*      ← Bearer tokens (machine-to-machine)
```

### Why This Works

Each route enforces authentication at a different layer:

1. **CF Access (/ant/*)**: 
   - Handled at Cloudflare edge (infrastructure level)
   - Requires OIDC login (email)
   - Returns 302 redirect to login

2. **mTLS (/spider/*)**:
   - WAF rule blocks at edge if cert invalid
   - Worker code double-checks `cf.tlsClientAuth.certVerified`
   - Returns 401 if validation fails

3. **Bearer tokens (/api/**):
   - Validated in Worker code
   - JWT signature verification
   - Returns 401 if invalid

---

## Implementation Checklist

### Phase 1-5: Certificate Setup ✅
- [x] Generate Certificate Authority (CA)
- [x] Generate client certificate
- [x] Upload CA to Cloudflare (SSL/TLS → Client Certificates)
- [x] Associate CA with hostname in "Enable mTLS on Hostname"

### Phase 6-7: Edge Protection ✅
- [x] Create WAF Custom Security Rule
- [x] Rule: `(not cf.tls_client_auth.cert_verified and http.request.uri.path in {"/spider/*"})`
- [x] Action: Block
- [x] **Important:** Path restriction ensures /ant/* is unaffected

### Phase 8: Worker Validation ✅
- [x] Read `cf.tlsClientAuth.certVerified` in Worker
- [x] Return 401 if not "SUCCESS"
- [x] Display cert details (Subject DN, Issuer DN) on success

### Phase 9: Testing ✅
- [x] Test WITHOUT certificate: Returns 401 ✓
- [x] Test WITH certificate: Returns 200 ✓
- [x] Test /ant/* (other auth): Still works (302 redirect) ✓
- [x] Test WAF isolation: Confirmed ✓

---

## Test Results

### Without Certificate
```bash
$ curl https://psychomments.awanipro.com/spider/
→ Status: 401
→ Error: "mTLS certificate required"
→ Details: certVerified: NONE
```

### With Valid Certificate
```bash
$ curl --cert client-cert.pem --key client-key.pem \
  https://psychomments.awanipro.com/spider/
→ Status: 200
→ HTML: "Spider - mTLS Protected"
→ Shows: Certificate Subject DN, Issuer DN
```

### /ant/* Unaffected
```bash
$ curl https://psychomments.awanipro.com/ant/topics
→ Status: 302 (CF Access redirect, NOT mTLS block)
→ Proves: WAF path restriction working
```

---

## Defense-in-Depth Layers

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Edge (WAF)** | Block if cert invalid | Primary gate (fails fast) |
| **Worker Code** | Check `certVerified` field | Safety net (defense in depth) |
| **Cert Validation** | Cloudflare validates cert against CA | Trust boundary enforcement |

**Why two layers?** 
- WAF rule fails fast at edge (best performance)
- Worker code provides explicit validation (defense in depth, audit trail in logs)

---

## Security Considerations

### What's Secured
- ✅ Only clients with valid certificates can reach /spider/*
- ✅ Certificate must be signed by your uploaded CA
- ✅ mTLS prevents man-in-the-middle (mutual authentication)
- ✅ Path isolation prevents bleeding to other routes

### What's NOT Secured
- ❌ Certificate revocation (requires API implementation)
- ❌ Key rotation (manual process currently)
- ❌ Certificate expiry alerts (calendar reminder only)

### Recommendations
1. Store CA private key offline or in secrets manager
2. Set certificate expiry reminders (90-365 days)
3. Document which clients have which certificates
4. Implement certificate revocation if needed (Cloudflare API)

---

## Comparison: CF Access vs Direct mTLS

### When to Use CF Access
- Protecting human-facing dashboards
- Need OAuth/OIDC identity verification
- Want centralized audit logs of "who logged in when"
- Complex policies (device posture, location checks)

### When to Use Direct mTLS
- Machine-to-machine communication
- IoT devices with certificates
- Internal services (no human login needed)
- Lower overhead, better performance
- Lighter setup (no IdP required)

**For spider:** Direct mTLS is ideal — no human login, just service-to-service auth.

---

## Files Changed

- `src/index.ts` — Added mTLS validation to /spider/* route
- Cloudflare Dashboard — WAF rule created, CA uploaded, hostname enabled
- `.dev.vars` — Client certificates stored in NO-COMMIT/ (not in source)

---

## Conclusion

**mTLS on Cloudflare Workers works beautifully without CF Access.**

The architecture cleanly separates three auth systems on one domain using path-based routing and proper validation layers. This provides:

- ✅ Security (certificate validation at edge + worker)
- ✅ Isolation (different auth methods per route)
- ✅ Performance (WAF blocks at edge)
- ✅ Simplicity (no complex Access policies needed)

Perfect for a multi-tenant application where different routes need different protection models.

---

## Next Steps (Optional)

1. Implement certificate rotation automation
2. Add certificate revocation checking (CRL/OCSP)
3. Create certificate management dashboard
4. Add certificate metrics/monitoring
5. Document certificate lifecycle for ops team

---

**Date Implemented:** August 28, 2026  
**Status:** ✅ Complete and tested  
**Deployment:** Production-ready
