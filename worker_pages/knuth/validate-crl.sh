#!/bin/bash
# Validate client certificate against CRL

CERT="${1:-certs/out/client-cert.pem}"
CRL="${2:-certs/out/crl.pem}"

if [ ! -f "$CERT" ]; then
  echo "❌ Certificate not found: $CERT"
  exit 1
fi

if [ ! -f "$CRL" ]; then
  echo "❌ CRL not found: $CRL"
  exit 1
fi

echo "=== Certificate Info ==="
SERIAL=$(openssl x509 -noout -serial -in "$CERT" | cut -d= -f2)
echo "Serial: $SERIAL"

echo -e "\n=== CRL Info ==="
REVOKED_COUNT=$(openssl crl -noout -text -in "$CRL" | grep -c "Serial Number:")
echo "Revoked certs in CRL: $REVOKED_COUNT"

echo -e "\n=== Revocation Status ==="
if openssl crl -noout -text -in "$CRL" | grep -q "Serial Number: $SERIAL"; then
  echo "❌ REVOKED: Certificate $SERIAL is in CRL"
  openssl crl -noout -text -in "$CRL" | grep -A3 "Serial Number: $SERIAL"
  exit 1
else
  echo "✅ VALID: Certificate $SERIAL NOT in CRL"
  exit 0
fi
