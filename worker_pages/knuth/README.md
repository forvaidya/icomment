# Laptop Backend: FastAPI with mTLS

A simple FastAPI service demonstrating mutual TLS (mTLS) — server certificate + client certificate verification.

## Setup

```bash
pip install -r requirements.txt
```

## Running with HTTPS + Client Cert Verification (Current)

```bash
python main.py
```

Starts on `https://localhost:9000` with:
- Server certificate: `certs/out/server-cert.pem`
- Server private key: `certs/out/server-key.pem`
- Client CA for verification: `certs/out/ca-cert.pem`

**Only clients presenting a valid certificate signed by the CA can connect.**

### Testing locally with curl:

```bash
# This WILL work (client cert provided)
curl --cert certs/out/client-cert.pem \
     --key certs/out/client-key.pem \
     --cacert certs/out/ca-cert.pem \
     https://localhost:9000/multiply?a=3&b=4

# This will FAIL (no client cert)
curl --cacert certs/out/ca-cert.pem \
     https://localhost:9000/multiply?a=3&b=4
# → SSL: CERTIFICATE_REQUIRED
```

## Running Plain HTTP (Alternative, Not Used)

If you want to run without TLS for testing:

```bash
# Edit main.py, replace uvicorn.run(...) with:
uvicorn.run(app, host="0.0.0.0", port=9000)
```

This would run on `http://localhost:9000` (no cert verification).

## Architecture

- **Browser/Client** → CloudFlare Pages Function
- **Pages Function** → (via Cloudflare Tunnel) → **This FastAPI server** (https://localhost:9000)
  - Pages Function presents client cert (`LAPTOP_BACKEND_CERT`, `LAPTOP_BACKEND_KEY` secrets)
  - FastAPI verifies it against the CA

## Endpoints

- `GET /multiply?a=<number>&b=<number>` — Multiplies two numbers, returns `{a, b, result}`
  - Returns 500 if `a` or `b` are not valid finite numbers

## Notes

- Cloudflare Tunnel (`cloudflared`) acts as the TLS client for this server
- Cloudflare Workers/Pages `fetch()` API does NOT support custom CA verification or client certs natively
- The **mTLS Certificate Binding** in Cloudflare Workers is for outbound client-cert auth to external origins (NOT for calling a private Workers, and NOT for calling through Tunnel due to the 520 block)
