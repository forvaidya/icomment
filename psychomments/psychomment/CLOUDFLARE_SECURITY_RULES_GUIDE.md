# Cloudflare Security Rules - mTLS Configuration

## ⚠️ CRITICAL: mTLS Must Be at ROOT LEVEL

### The Problem

If mTLS rule is nested under **Access**, it applies **Access policy to everything beneath it**.

```
❌ WRONG - Access controls mTLS
Access
  ├── /ant/* (email auth)
  ├── /spider/* (mTLS) ← gets Access policy too!
  └── /api/* (Bearer) ← gets Access policy too!

Result: Conflicts, authentication failures
```

---

### The Solution

mTLS **MUST be at ROOT LEVEL**, separate from Access:

```
✅ CORRECT - Independent authentication layers
Root Level (Cloudflare Edge)
  ├── Security Rules (WAF) ← mTLS rule lives here
  │   └── "Enforce mTLS authentication [Template]"
  │       └── Path: /spider/*
  │
  └── Access Policies
      └── /ant/* (email auth only)
```

---

## How to Configure

### Step 1: Navigate to Security Rules

**Path in Cloudflare Dashboard:**
```
Left Sidebar: Security
  ↓
Security rules (root level - NOT under Access)
```

### Step 2: Create mTLS Rule

**Location:** `Security → Security rules`

**Rule Template:** "Enforce mTLS authentication [Template]"

**Configuration:**
```
Name: Enforce mTLS authentication [Template]
Condition: 
  - (not cf.tls_client_auth.cert_verified) 
  - AND (http.request.uri.path in {"/spider/*"})
Action: Block
Priority: 1
Status: Enabled
```

### Step 3: Verify Path Restriction

**Critical:** The rule must have path restriction to `/spider/*`

**Why:**
- `/ant/*` should NOT be affected (uses CF Access)
- `/api/*` should NOT be affected (uses Bearer tokens)
- `/spider/*` ONLY requires mTLS

---

## Configuration Hierarchy (Correct)

```
Cloudflare Dashboard
│
├── Security (Root Level)
│   ├── Security rules
│   │   └── "Enforce mTLS authentication"
│   │       └── Path: /spider/*
│   │
│   ├── DDoS protection
│   └── WAF
│
├── Access (Separate, Independent)
│   └── Access policies
│       └── /ant/* (email auth)
│
└── SSL/TLS
    └── Client Certificates
        └── mTLS enabled on hostname
```

---

## Three Independent Auth Systems

Each layer operates **independently** at different levels:

### Layer 1: Edge (Cloudflare)
```
Security Rules (WAF)
  ├── mTLS validation for /spider/*
  ├── DDoS protection
  └── Rate limiting
```

**Protects:** All requests, before routing to Worker

### Layer 2: Access (Infrastructure)
```
Access Policies
  └── OIDC/Email auth for /ant/*
```

**Protects:** Human-facing endpoints

### Layer 3: Worker (Application)
```
Worker Code (in src/index.ts)
  ├── Validate cf.tlsClientAuth for /spider/ingest, /spider/subscribe
  ├── Validate Bearer token for /api/*
  └── Route logic for /ant/*
```

**Protects:** Application-level business logic

---

## Visual Reference

![Cloudflare Security Rules - mTLS Configuration](./docs/images/cf-security-rules-mtls.png)

**Key Areas Highlighted:**
- 🔴 **Red arrow**: Navigation to Security rules (ROOT level)
- 🔵 **Blue circle**: mTLS rule for `/spider/*` path
- ✅ **Separate from Access**: Notice Access is NOT controlling this

---

## Testing Isolation

### Test mTLS `/spider/*`
```bash
# Without cert - should get 401 from WAF
curl https://psychomments.awanipro.com/spider/

# With cert - should succeed
curl --cert client-cert.pem --key client-key.pem \
  https://psychomments.awanipro.com/spider/
```

### Test Access `/ant/*`
```bash
# Without login - should get 302 redirect to CF Access
curl -i https://psychomments.awanipro.com/ant/topics
```

### Result
- ✅ `/spider/*` blocked by WAF rule, not affected by Access
- ✅ `/ant/*` still protected by CF Access (independent)
- ✅ No cross-contamination between auth systems

---

## Common Mistakes to Avoid

❌ **Mistake 1:** Putting mTLS rule under Access
- Result: Access policy applies to mTLS routes
- Fix: Move rule to root-level Security section

❌ **Mistake 2:** Not restricting path in WAF rule
- Result: mTLS blocks `/ant/*` and `/api/*` too
- Fix: Add path condition: `http.request.uri.path in {"/spider/*"}`

❌ **Mistake 3:** Not deploying Worker validation
- Result: WAF blocks, but no application-level auth
- Fix: Add Worker code: `cf.tlsClientAuth.certVerified === 'SUCCESS'`

❌ **Mistake 4:** Forgetting to enable mTLS on hostname
- Result: Cloudflare won't validate certificates
- Fix: SSL/TLS → Client Certificates → Enable on hostname

---

## Implementation Checklist

- [x] Security rules at ROOT level (not under Access)
- [x] mTLS WAF rule created with path restriction
- [x] `/spider/*` path specified in rule condition
- [x] Worker validation code deployed
- [x] mTLS enabled on hostname
- [x] Client certificates generated
- [x] Tested without cert (401)
- [x] Tested with cert (200)
- [x] `/ant/*` still works (302 Access redirect)
- [x] `/api/*` still works (Bearer token)

---

## Production Checklist

Before going live:
- [ ] WAF rule priority is correct
- [ ] mTLS enabled on all required hostnames
- [ ] Client certificates exported and distributed
- [ ] Firewall rule has no unintended side effects
- [ ] Access policies still protecting `/ant/*`
- [ ] Monitoring alerts set for certificate expiry
- [ ] Documentation updated for device teams

---

**Key Takeaway:** 🔑

**mTLS at ROOT level = Clean, independent authentication**

**mTLS nested under Access = Conflicting policies, bugs**

---

**Date:** August 29, 2026  
**Status:** ✅ Production architecture verified  
**Domain:** psychomments.awanipro.com  
**Auth Systems:** 3 independent layers (Edge, Infrastructure, Application)
