#!/bin/bash
set -e

CERTS_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$CERTS_DIR/out"
mkdir -p "$OUT_DIR"

# CA (self-signed)
openssl genrsa -out "$OUT_DIR/ca-key.pem" 2048
openssl req -new -x509 -days 3650 -key "$OUT_DIR/ca-key.pem" -out "$OUT_DIR/ca-cert.pem" \
  -subj "/CN=laptop-backend-ca"

# Server cert (signed by CA)
openssl genrsa -out "$OUT_DIR/server-key.pem" 2048
openssl req -new -key "$OUT_DIR/server-key.pem" -out "$OUT_DIR/server.csr" \
  -subj "/CN=port9000.awanipro.com"
openssl x509 -req -days 365 -in "$OUT_DIR/server.csr" \
  -CA "$OUT_DIR/ca-cert.pem" -CAkey "$OUT_DIR/ca-key.pem" -CAcreateserial \
  -out "$OUT_DIR/server-cert.pem"
rm "$OUT_DIR/server.csr"

# Client cert (signed by CA)
openssl genrsa -out "$OUT_DIR/client-key.pem" 2048
openssl req -new -key "$OUT_DIR/client-key.pem" -out "$OUT_DIR/client.csr" \
  -subj "/CN=cloudflare-worker-client"
openssl x509 -req -days 365 -in "$OUT_DIR/client.csr" \
  -CA "$OUT_DIR/ca-cert.pem" -CAkey "$OUT_DIR/ca-key.pem" -CAcreateserial \
  -out "$OUT_DIR/client-cert.pem"
rm "$OUT_DIR/client.csr"

echo "✓ Certificates generated in $OUT_DIR/"
ls -lh "$OUT_DIR"/*.pem
