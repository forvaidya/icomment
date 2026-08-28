#!/usr/bin/env python3
"""
Convert JSON to JWT token
Usage: python3 encode-jwt.py
"""

import json
import jwt
import time
import sys

# Install: pip install PyJWT

# Your JSON payload (from browser)
payload = {
    "aud": ["90d83908bd9982a957925767d8d78895aa6f643850d83d0116730771344bb1e7"],
    "email": "forvaidya@gmail.com",
    "exp": 1787935880,
    "iat": 1787849480,
    "nbf": 1787849480,
    "iss": "https://mahesh-demoz.cloudflareaccess.com",
    "type": "app",
    "identity_nonce": "t2ag2zfwZ96xTuSS",
    "sub": "27e34ed8-c5ce-571c-8165-9f0c2494d336",
    "h_INTERNAL_DO_NOT_USE": "psychomments.awanipro.com",
    "country": "IN",
    "policy_id": "4196c262-24df-41d8-b565-db823b765c59"
}

# Secret key (change this!)
SECRET_KEY = "your-secret-key-here"

# Encode to JWT
try:
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    print("✅ JWT Token Generated:\n")
    print(token)
    print("\n" + "="*80)
    print("Use this token in requests:")
    print("="*80)
    print(f'curl -H "Authorization: Bearer {token}" http://localhost:8787/api/iot/token')
    print("\n" + "="*80)
    print("Decoded (verify):")
    print("="*80)
    decoded = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    print(json.dumps(decoded, indent=2))
except Exception as e:
    print(f"❌ Error: {e}")
    print("\nInstall PyJWT:")
    print("  pip install PyJWT")
    sys.exit(1)
