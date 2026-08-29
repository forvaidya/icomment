# mTLS Browser Testing Guide

## Overview

This guide explains how to test mTLS-protected endpoints (`/spider/*`) in a web browser on macOS. While curl testing proves the endpoint works, browser testing provides visual confirmation and helps with UI/UX validation.

---

## When Browser Testing Matters

| Use Case | Tool | Why |
|----------|------|-----|
| **API validation** | curl | Fast, direct, no UI overhead |
| **Client integration** | curl | Programmatic testing, CI/CD friendly |
| **UI verification** | Browser | Visual confirmation, interactive testing |
| **End-to-end flow** | Browser | Real user experience, certificate dialogs |

**For `/spider/*`:** curl is sufficient since it's a machine-to-machine endpoint. Browser testing is optional but educational.

---

## Prerequisites

- macOS with Brave browser (or Chrome/Firefox)
- Client certificate files:
  - `client-cert.pem` (public certificate)
  - `client-key.pem` (private key)

---

## Step 1: Create PKCS12 File

Convert PEM files to `.p12` format (required for macOS Keychain):

```bash
cd NO-COMMIT/
openssl pkcs12 -export -out client-cert.p12 \
  -inkey client-key.pem \
  -in client-cert.pem \
  -passout pass:
```

**Options:**
- `-passout pass:` — no password (leave empty when importing)
- Output: `client-cert.p12` (~2.8 KB)

---

## Step 2: Import Certificate into macOS Keychain

**Method A: GUI (Easiest)**

1. Open Finder → Navigate to `NO-COMMIT/` folder
2. Double-click `client-cert.p12`
3. Keychain Access app opens
4. Dialog appears asking for **PKCS12 password** → Leave blank, click OK
5. Dialog appears asking **which Keychain** → Select **"Local Items"**
6. Enter your **Mac password** to authorize
7. Click **Add**

**Result:** Certificate now in macOS Keychain ✅

**Method B: Terminal**

```bash
security import client-cert.p12 -k ~/Library/Keychains/login.keychain-db \
  -P "" -A
```

---

## Step 3: Configure Browser

### Brave Browser

1. **Settings** → **Privacy and security**
2. Scroll to **Security**
3. Click **Manage certificates**
4. Click **Your Certificates** tab
5. Should see: "Use imported local certificates from your operating system" → "2 certificates"
6. If not listed, restart Brave to refresh

### Chrome/Chromium

Same steps as Brave (Chromium-based).

### Firefox

1. Preferences → **Privacy & Security**
2. Scroll to **Security** → **Certificates**
3. Click **View Certificates** → **Your Certificates** tab
4. Click **Import** → Select `client-cert.p12`
5. Leave password blank → OK

---

## Step 4: Test the Endpoint

1. Open browser
2. Navigate to: `https://psychomments.awanipro.com/spider/`
3. **First time:** Browser prompts "Which certificate do you want to use?"
   - Select the certificate you imported
4. **Result:** Should see success page with certificate details

**Expected page:**
```
🕷️ Spider App (mTLS Protected)
✅ Authenticated via mTLS Certificate
Certificate Details:
  Subject: CN=Cloudflare,C=US
  Issuer: CN=Managed CA fd13bf6b366f66d013202fb0188b9840...
```

---

## Troubleshooting

### Error: "Certificate not valid for this server"

**Cause:** Certificate CN doesn't match the domain.

**Check:** The server is validating at edge (Cloudflare), not at the domain level. This is expected for mTLS client certs.

**Solution:** This is correct behavior. Proceed.

---

### Error: "Invalid certificate"

**Cause:** Keychain auth failed or certificate wasn't properly imported.

**Fix:**
1. Delete certificate from Keychain (Keychain Access → right-click → Delete)
2. Re-import from step 2
3. Restart browser
4. Try again

---

### Browser says "No certificates" in Your Certificates tab

**Cause:** Keychain import didn't complete or browser can't access it.

**Fix:**
1. Open Keychain Access app
2. Verify certificate is there
3. Restart browser (full quit, not just tab close)
4. Check "Your Certificates" again

---

### Brave asks for Mac password repeatedly

**Cause:** Keychain access permissions.

**Fix:**
1. First time: Enter username and password, click Allow
2. macOS remembers this; subsequent prompts are normal
3. Click "Always Allow" if option appears

---

## Security Considerations

### Private Key Storage

✅ **Safe:** Private key stays in macOS Keychain (encrypted)
- Not in browser's cache
- Not on disk unencrypted
- Protected by OS-level encryption

❌ **Unsafe:** Storing `.pem` files on disk unencrypted
- Always keep `client-key.pem` in `.gitignore`
- Only store in `NO-COMMIT/` directory

### Certificate Lifecycle

- **Validity:** Check certificate expiration (run: `openssl x509 -in client-cert.pem -noout -text`)
- **Rotation:** Regenerate `.pem` files and re-import when expired
- **Revocation:** Currently manual (no CRL/OCSP checking)

---

## Comparison: curl vs Browser

### curl (Recommended for APIs)

```bash
curl --cert client-cert.pem --key client-key.pem \
  https://psychomments.awanipro.com/spider/
```

**Advantages:**
- ✅ No UI overhead
- ✅ Scriptable
- ✅ CI/CD friendly
- ✅ Direct certificate passing

**Use for:** Automated testing, services, IoT devices

---

### Browser (Optional for UI)

**Advantages:**
- ✅ Visual confirmation
- ✅ Certificate dialog shows certificate details
- ✅ Interactive testing
- ✅ Real user experience

**Use for:** Manual testing, demos, UI/UX validation

---

## Next Steps

1. **For APIs:** Continue using curl with `--cert` and `--key`
2. **For Services:** Configure your application to use client certificates
3. **For IoT:** Use mTLS libraries (e.g., Node.js `https` module with cert/key options)
4. **For Monitoring:** Set certificate expiry alerts (90-180 days before expiry)

---

## Real-World Example

### Python IoT Client

```python
import requests

cert = ('/path/to/client-cert.pem', '/path/to/client-key.pem')
response = requests.get(
    'https://psychomments.awanipro.com/spider/',
    cert=cert,
    verify=True  # Verify Cloudflare's certificate
)
print(response.text)
```

### Node.js IoT Client

```javascript
const fs = require('fs');
const https = require('https');

const options = {
  cert: fs.readFileSync('/path/to/client-cert.pem'),
  key: fs.readFileSync('/path/to/client-key.pem'),
  hostname: 'psychomments.awanipro.com',
  path: '/spider/',
  method: 'GET'
};

https.request(options, (res) => {
  res.pipe(process.stdout);
}).end();
```

---

## Summary

| Layer | Mechanism | Tested? |
|-------|-----------|---------|
| **Edge (Cloudflare)** | WAF rule blocks invalid certs | ✅ Yes (401 without cert) |
| **Worker Code** | Validates `cf.tlsClientAuth.certVerified` | ✅ Yes (200 with cert) |
| **Keychain** | Stores client certificate | ✅ Yes (Brave can access) |
| **Browser** | Presents certificate to server | ⚠️ Partial (curl confirmed) |

**Status:** Production-ready. mTLS protection fully functional.

---

**Date:** August 28, 2026  
**Status:** ✅ Tested and documented  
**Applies to:** `/spider/*` endpoint only
