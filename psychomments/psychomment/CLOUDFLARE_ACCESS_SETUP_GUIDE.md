# Cloudflare Access Application Setup Guide

## How to Create and Configure Access Applications

### What is Cloudflare Access?

Cloudflare Access provides **identity-aware proxy** for protecting applications:
- ✅ OIDC/OAuth authentication
- ✅ Email-based access
- ✅ Group/organization policies
- ✅ Device posture checks
- ✅ Zero Trust security

---

## Navigation Path

```
Cloudflare Dashboard
  ↓
Access (left sidebar)
  ↓
Applications
  ↓
Create Application
```

---

## Step-by-Step Setup

### Step 1: Create New Application

**Path:** `Access → Applications → Create Application`

**Application Type:** Select **"Self-hosted"**
- For internally hosted applications
- Or applications behind Cloudflare Workers

### Step 2: Configure Destinations

**Tab:** "Destinations"

**Destination Details:**
```
Public hostnames
├── Subdomain: (optional) - leave blank for root
├── Domain: psychomments.awanipro.com
└── Path: /ant/*  ← CRITICAL: Restrict to /ant/* only
```

**Why Path Restriction?**
- Protects only `/ant/*` routes
- Leaves `/spider/*` for mTLS
- Leaves `/api/*` for Bearer tokens
- Prevents Access from interfering with other auth methods

### Step 3: Configure Policy Rules

**Tab:** "Policies"

**Policy Structure:**

```
Policy Name: "Email authentication"
Rule Type: Include
├── Condition: Emails
│   └── Value: [your-email@example.com]
│
├── Authentication Method: Emails
│   └── Provider: Cloudflare
│
└── Action: Allow
```

**Policy Details Section:**
- **Policy Name:** Descriptive name (e.g., "Email authentication", "Admin access")
- **Action:** Allow
- **Policy session duration:** Same as application session duration
- **Additional settings:** Optional MFA, device posture, etc.

### Step 4: Review and Deploy

**Tab:** "All" or "Details"

**Verify:**
- ✅ Application name
- ✅ Destination: psychomments.awanipro.com/ant/*
- ✅ Policy: Email authentication
- ✅ Action: Allow

**Click "Save"** to deploy

---

## Visual Reference

![Cloudflare Access Application - Setup Configuration](./docs/images/cf-access-setup.png)

**Key Areas Highlighted:**
- 🔴 **Red circle**: Path field showing `/ant/*` (critical restriction)
- 🔴 **Red arrow**: Policy Name and Action (Allow)

---

## Complete Configuration Example

### Application: psychomments-ant

**Destinations Tab:**
```
Domain: psychomments.awanipro.com
Path: /ant/*
```

**Policies Tab:**

**Policy 1: Email authentication**
```
Rule Type: Include
Condition: 
  - Emails ending in: @yourdomain.com
  OR
  - Emails: user@example.com, another@example.com

Authentication Method: Emails
Action: Allow
Priority: 1
```

**Optional Policy 2: Admin only**
```
Rule Type: Include
Condition:
  - Emails: admin@example.com

Authentication Method: Emails
Action: Allow
Priority: 2
```

---

## Access vs Other Auth Methods

### Three Independent Systems on One Domain

```
Domain: psychomments.awanipro.com

/ant/*
  └── Cloudflare Access (OIDC/Email)
      ├── 302 redirect to login
      ├── CF Access JWT token
      └── User identity preserved in claims

/spider/*
  └── mTLS (Certificate-based)
      ├── Client certificate required
      ├── Device identity from cert
      └── No human login needed

/api/*
  └── Bearer Token (JWT)
      ├── Token in Authorization header
      ├── Machine-to-machine auth
      └── No interactive login
```

---

## Testing Access Configuration

### Test 1: Without Login (Should Redirect)
```bash
curl -i https://psychomments.awanipro.com/ant/topics
```

**Expected:**
- Status: 302 Found
- Location: Cloudflare Access login page
- Body: Redirect HTML

### Test 2: With Access Token
```bash
# 1. Login through browser
# 2. Copy CF Access JWT from cookie
curl -H "Cookie: CF_Authorization=<token>" \
  https://psychomments.awanipro.com/ant/topics
```

**Expected:**
- Status: 200 OK
- Body: Topics page HTML

### Test 3: Verify mTLS NOT affected
```bash
# /spider/* should require mTLS, not Access
curl https://psychomments.awanipro.com/spider/
```

**Expected:**
- Status: 401 (mTLS required)
- Body: JSON error (not Access redirect)

---

## Common Configurations

### Configuration 1: Email Allowlist

```
Policy Name: "Allowed users"
Rule Type: Include
├── Condition: Emails
│   └── Value: 
│       - user1@example.com
│       - user2@example.com
│       - admin@example.com
└── Action: Allow
```

### Configuration 2: Domain-wide Access

```
Policy Name: "Organization access"
Rule Type: Include
├── Condition: Emails ending in
│   └── Value: @example.com
└── Action: Allow
```

### Configuration 3: Multi-factor Authentication

```
Policy Name: "MFA required"
Rule Type: Include
├── Condition: Emails
│   └── Value: [any]
├── Additional settings:
│   └── Require MFA: Yes
└── Action: Allow
```

### Configuration 4: Group/Organization

```
Policy Name: "GitHub organization"
Rule Type: Include
├── Condition: GitHub Organization
│   └── Value: your-org
├── Authentication Method: GitHub
└── Action: Allow
```

---

## Advanced: Login Methods

**Available Methods:**
- ✅ Emails (Cloudflare managed)
- ✅ One-time PIN (OTP)
- ✅ GitHub Organization
- ✅ Google Workspace
- ✅ Okta
- ✅ Azure AD
- ✅ Custom OIDC provider
- ✅ Service Auth (API tokens)

**For psychomments:**
- Recommended: **Emails** (simplest, no external IdP)
- Alternative: **GitHub Organization** (for team access)

---

## Production Checklist

- [x] Application created: "psychomments-ant"
- [x] Destination: psychomments.awanipro.com/ant/*
- [x] Policy: Email authentication
- [x] Action: Allow
- [x] Login method: Emails
- [x] Session duration configured
- [x] Tested: Redirect works (302)
- [x] Tested: /spider/* NOT affected
- [x] Tested: /api/* NOT affected
- [x] Monitored: Access logs in dashboard

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Access redirects /spider/* | Wrong path or no path restriction | Add path: /ant/* only |
| Access shows on all paths | Policy applies to root | Verify path restriction in destination |
| /api/* gets Access redirect | Bearer token not checked | Add Bearer token validation in Worker |
| Users can't login | Wrong email domain | Add email to allowlist or use @domain rule |
| Session expires too fast | Session duration too short | Increase session duration in policy |

---

## Security Best Practices

✅ **Do:**
- Use path restriction (`/ant/*`)
- Keep Access separate from mTLS routes
- Require MFA for admin access
- Monitor access logs
- Rotate policies regularly
- Use group-based access when available

❌ **Don't:**
- Leave path empty (applies to entire domain)
- Mix Access with mTLS on same route
- Allow unauthenticated access
- Hardcode credentials
- Skip policy review

---

## Related Documentation

- [CLOUDFLARE_MTLS_SETUP_GUIDE.md](./CLOUDFLARE_MTLS_SETUP_GUIDE.md) — mTLS configuration
- [CLOUDFLARE_SECURITY_RULES_GUIDE.md](./CLOUDFLARE_SECURITY_RULES_GUIDE.md) — WAF rules
- [MTLS_FINDINGS.md](./MTLS_FINDINGS.md) — Access vs mTLS comparison

---

## Quick Reference

**Access Application: psychomments-ant**

```
Domain:     psychomments.awanipro.com
Path:       /ant/*
Policy:     Email authentication
Action:     Allow
Duration:   24 hours
Status:     ✅ Active
```

**Test Command:**
```bash
curl -i https://psychomments.awanipro.com/ant/topics
# Expected: 302 redirect to Access login
```

---

**Date:** August 29, 2026  
**Status:** ✅ Production-ready  
**Domain:** psychomments.awanipro.com  
**Access App:** psychomments-ant active and protecting `/ant/*`
