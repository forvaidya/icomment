#!/bin/bash
# Convert JSON to JWT token (shell script)
# Usage: ./encode-jwt.sh

SECRET_KEY="your-secret-key-here"

# JSON payload (minified)
PAYLOAD='{"aud":["90d83908bd9982a957925767d8d78895aa6f643850d83d0116730771344bb1e7"],"email":"forvaidya@gmail.com","exp":1787935880,"iat":1787849480,"nbf":1787849480,"iss":"https://mahesh-demoz.cloudflareaccess.com","type":"app","identity_nonce":"t2ag2zfwZ96xTuSS","sub":"27e34ed8-c5ce-571c-8165-9f0c2494d336","h_INTERNAL_DO_NOT_USE":"psychomments.awanipro.com","country":"IN","policy_id":"4196c262-24df-41d8-b565-db823b765c59"}'

# Header (HS256)
HEADER='{"alg":"HS256","typ":"JWT"}'

# Base64 encode (URL-safe, no padding)
encode_base64() {
  echo -n "$1" | base64 | tr '+/' '-_' | sed 's/=*$//'
}

# Create signature using HMAC-SHA256
create_signature() {
  local header_payload="$1"
  echo -n "$header_payload" | openssl dgst -sha256 -hmac "$SECRET_KEY" -binary | base64 | tr '+/' '-_' | sed 's/=*$//'
}

# Encode parts
HEADER_B64=$(encode_base64 "$HEADER")
PAYLOAD_B64=$(encode_base64 "$PAYLOAD")

# Create signature
HEADER_PAYLOAD="${HEADER_B64}.${PAYLOAD_B64}"
SIGNATURE=$(create_signature "$HEADER_PAYLOAD")

# Final JWT
JWT="${HEADER_PAYLOAD}.${SIGNATURE}"

echo "✅ JWT Token Generated:"
echo ""
echo "$JWT"
echo ""
echo "================================================================================"
echo "Use this token in requests:"
echo "================================================================================"
echo "curl -H \"Authorization: Bearer $JWT\" http://localhost:8787/api/iot/token"
echo ""
