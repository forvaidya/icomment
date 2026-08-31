#!/bin/bash
set -e

echo "Generating self-signed server certificate only (no client cert)"
echo "=============================================================="
echo ""
echo "Uses existing CA (ca-cert.pem) to sign server certificate."
echo "Call this to regenerate server cert without client cert."
echo ""

CERTS_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$CERTS_DIR/out"
mkdir -p "$OUT_DIR"

# Check if CA exists
if [ ! -f "$OUT_DIR/ca-cert.pem" ] || [ ! -f "$OUT_DIR/ca-key.pem" ]; then
    echo "❌ CA certificate not found!"
    echo "Run ./generate-certs.sh first to create CA"
    exit 1
fi

echo "Generating server certificate signed by CA..."

# Server cert (signed by CA) with SAN
openssl genrsa -out "$OUT_DIR/server-key.pem" 2048
openssl req -new -key "$OUT_DIR/server-key.pem" -out "$OUT_DIR/server.csr" \
  -subj "/CN=knuth.awanipro.com"
openssl x509 -req -days 365 -in "$OUT_DIR/server.csr" \
  -CA "$OUT_DIR/ca-cert.pem" -CAkey "$OUT_DIR/ca-key.pem" -CAcreateserial \
  -extfile <(printf "subjectAltName=DNS:knuth.awanipro.com,IP:15.206.133.75") \
  -out "$OUT_DIR/server-cert.pem"
rm "$OUT_DIR/server.csr"

echo ""
echo "✓ Server certificate generated:"
ls -lh "$OUT_DIR/server-cert.pem" "$OUT_DIR/server-key.pem"
