# Cloudflare mTLS Setup Guide

## How to Create and Configure Client Certificates

### Navigation Path

```
Cloudflare Dashboard
  ↓
SSL/TLS (left sidebar)
  ↓
Client Certificates
  ↓
Cloudflare-issued Client Certificates
```

### Step-by-Step

#### Step 1: Access SSL/TLS Settings
- Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
- Select your domain: **awanipro.com**
- Left sidebar → **SSL/TLS**

#### Step 2: Navigate to Client Certificates
- In SSL/TLS dropdown menu
- Click **Client Certificates**
- You'll see two tabs:
  - **Cloudflare-issued** (recommended)
  - **BYOCA** (Bring Your Own CA)

#### Step 3: View Cloudflare-issued Certificates
Page shows:
- **"Cloudflare-issued Client Certificates"** heading
- Description: "Manage client certificates created with your account Cloudflare-managed CA"

#### Step 4: Enable mTLS on Hostname
- Find **"Hosts"** section
- Dropdown shows: **"Choose which host(s) you wish to enable mTLS"**
- Currently enabled: **psychomments.awanipro.com**

#### Step 5: Filter by Status
- **"All statuses"** dropdown
- Filter certificates by: Active, Pending, Expired, Revoked

---

## Visual Reference

![Cloudflare mTLS Setup - Navigation and Configuration](./docs/images/cf-mtls-setup.png)

**Key Areas Highlighted:**
- 🔴 **Red circle**: Domain selector (awanipro.com)
- 🔴 **Red box**: SSL/TLS menu path
- 🔴 **Red arrow**: Navigation to Client Certificates section

---

## Creating a Client Certificate

### Via Cloudflare Dashboard

1. In **Cloudflare-issued Client Certificates** page
2. Click **"Create Certificate"** (if button visible)
3. Fill in:
   - **Certificate name** (e.g., "iot-device-1")
   - **Hostnames** (optional, if restricting to specific hosts)
   - **Validity period** (15 days to 10 years)
4. Click **Create**
5. Download the certificate pair:
   - `.crt` file (public certificate)
   - `.key` file (private key)
   - Store in `NO-COMMIT/` directory

### Via Cloudflare API

```bash
curl -X POST https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/client_certificates \
  -H "Authorization: Bearer {API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "certificate": "-----BEGIN CERTIFICATE-----...",
    "private_key": "-----BEGIN PRIVATE KEY-----...",
    "bundle_method": "optimal"
  }'
```

---

## Enable mTLS on Hostname

### Step 1: Prepare CA Certificate
- Must have CA certificate uploaded to Cloudflare
- OR use Cloudflare-managed CA

### Step 2: Enable on Hostname
- In **Client Certificates** page
- **Hosts** section
- Add hostname: `psychomments.awanipro.com`
- Save

### Step 3: Verify Enablement
- WAF rule should block requests without valid cert
- Test with curl:

```bash
# Without certificate (should get 401)
curl https://psychomments.awanipro.com/spider/

# With certificate (should succeed)
curl --cert client-cert.pem --key client-key.pem \
  https://psychomments.awanipro.com/spider/
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Certificate not appearing in dashboard | Wait 2-5 minutes for sync; refresh page |
| mTLS not blocking requests | Verify WAF rule is enabled and correct |
| "Certificate not valid" in browser | Install .p12 format in browser keychain |
| Requests getting 403 instead of 401 | Check if CF Access policy is conflicting |

---

## Security Best Practices

✅ **Do:**
- Store private keys in `.gitignore` / `NO-COMMIT/`
- Rotate certificates every 90 days
- Use unique certificates per device/service
- Monitor certificate expiry dates

❌ **Don't:**
- Commit `.key` files to git
- Reuse certificates across environments
- Ignore certificate expiry warnings
- Store secrets in certificate comments

---

## Related Documentation

- [MTLS_FINDINGS.md](./MTLS_FINDINGS.md) — Deep dive on mTLS vs CF Access
- [MTLS_BROWSER_TESTING.md](./MTLS_BROWSER_TESTING.md) — Browser testing procedures
- [SPIDER_CONSOLIDATION.md](./SPIDER_CONSOLIDATION.md) — API endpoint consolidation

---

## Quick Reference

**For IoT/Devices:**
- Use mTLS certificates (no token overhead)
- Endpoints: `/spider/ingest`, `/spider/subscribe`
- Device ID from certificate Subject DN

**For Humans/UI:**
- Use CF Access (email authentication)
- Endpoints: `/ant/*`
- Session managed by Cloudflare

**For Legacy APIs:**
- Use Bearer tokens (JWT)
- Endpoints: `/api/*`
- Token validation in Worker code

---

**Date:** August 29, 2026  
**Status:** ✅ Current and tested  
**Domain:** psychomments.awanipro.com  
**mTLS Status:** 🔒 Active and enforced
