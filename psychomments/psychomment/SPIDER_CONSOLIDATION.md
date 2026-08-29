# Spider Namespace Consolidation

## Summary

Consolidated all IoT endpoints under the `/spider/*` namespace with exclusive mTLS authentication. Removed legacy JWT validation endpoint.

---

## Changes Made

### 1. Endpoint Migrations

| Old Route | New Route | Auth | Status |
|-----------|-----------|------|--------|
| `/ingest` | `/spider/ingest` | mTLS only | ✅ Deployed |
| `/subscribe` | `/spider/subscribe` | mTLS only | ✅ Deployed |
| `/ant/ant/validate` | (removed) | - | ✅ Removed |

### 2. Authentication Simplified

**Before:**
- `/ingest` required bearer token
- `/subscribe` required bearer token
- Token validation via KV store

**After:**
- `/spider/ingest` requires mTLS certificate only
- `/spider/subscribe` requires mTLS certificate only
- Device identity from certificate Subject DN
- Zero token overhead

### 3. Device Identification

Device ID is now extracted from client certificate's Subject DN:
```
CN=Cloudflare,C=US
```

No more token-to-device-id mapping needed. Certificate is the identity.

---

## API Changes

### POST `/spider/ingest` (mTLS)

**Request:**
```bash
curl --cert client-cert.pem --key client-key.pem \
  -X POST https://psychomments.awanipro.com/spider/ingest \
  -H "Content-Type: application/json" \
  -d '{"temperature":25.5,"humidity":60}'
```

**Response (Success):**
```json
{
  "ok": true,
  "device_id": "CN=Cloudflare,C=US",
  "msg_id": "8fcbc1ea-ff21-47e7-955d-6ff12b56c66a"
}
```

**Response (No Certificate):**
```json
{
  "error": "mTLS certificate required",
  "details": "certVerified: NONE"
}
```

---

### GET `/spider/subscribe` (WebSocket, mTLS)

**Request:**
```bash
curl --cert client-cert.pem --key client-key.pem \
  -N -H "Connection: Upgrade" \
  https://psychomments.awanipro.com/spider/subscribe
```

WebSocket upgrade requires mTLS certificate. No bearer token needed.

---

## Database Schema

Created `iot_messages` table:
```sql
CREATE TABLE iot_messages (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Path Isolation Verified

| Route | Auth Method | Status |
|-------|-------------|--------|
| `/spider/*` | mTLS (certificate) | ✅ Enforced |
| `/ant/*` | CF Access (OIDC) | ✅ Enforced |
| `/api/*` | Bearer token | ✅ Still available |

---

## Security Model

```
Browser/Human               IoT Device/Service         API Client
    ↓                              ↓                         ↓
  CF Access              mTLS Certificate               Bearer Token
    ↓                              ↓                         ↓
/ant/topics            /spider/ingest                 /api/iot/token
                       /spider/subscribe
```

**Why this works:**
- CF Access: Human-friendly OAuth/OIDC flow
- mTLS: Machine-friendly certificate-based auth (no tokens, no rotation overhead)
- Bearer tokens: Legacy API support, simpler than mTLS for quick integrations

---

## Testing Checklist

✅ `/spider/ingest` with certificate: Success  
✅ `/spider/ingest` without certificate: 401 error  
✅ `/spider/subscribe` upgrade: Requires certificate  
✅ `/ant/topics`: Still redirects to CF Access (302)  
✅ Path isolation: No bleeding between routes  
✅ D1 table created and messages persisting  

---

## Files Changed

- `src/index.ts` — Endpoint consolidation, auth removal, mTLS validation
- D1 Remote — Created `iot_messages` table

---

## Deployment

**Version:** c17762c7-c203-4d93-a172-cadc6de49e94  
**Status:** ✅ Live  
**Domain:** psychomments.awanipro.com

---

## Next Steps (Optional)

1. Index `iot_messages` by device_id for faster queries
2. Implement message retention policy (archival/cleanup)
3. Add certificate expiry monitoring
4. Document for device manufacturers

---

**Date:** August 29, 2026  
**Status:** ✅ Complete and tested
