import ssl
import os
import argparse
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


@app.get("/multiply")
async def multiply(a: float, b: float):
    """Multiply two numbers. Mirrors aspire-math's /add endpoint."""
    if not (isinstance(a, (int, float)) and isinstance(b, (int, float))):
        return {"error": "Query parameters a and b must be valid numbers"}, 500

    if not (float('-inf') < a < float('inf') and float('-inf') < b < float('inf')):
        return {"error": "Query parameters a and b must be valid numbers"}, 500

    return {"a": a, "b": b, "result": a * b}


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--no-mtls", action="store_true", help="Run plain HTTP without mTLS (test mode)")
    parser.add_argument("--cert", type=str, default="certs/out/server-cert.pem", help="Path to SSL certificate")
    parser.add_argument("--key", type=str, default="certs/out/server-key.pem", help="Path to SSL private key")
    parser.add_argument("--ca", type=str, default="certs/out/ca-cert.pem", help="Path to CA cert for client verification")
    args = parser.parse_args()

    if args.no_mtls:
        # Test mode: plain HTTP
        print("\n" + "="*60)
        print("⚠️  MTLS DISABLED !!")
        print("="*60)
        print("Server running in TEST MODE (plain HTTP, no client cert required)")
        print("\nTo enable mTLS (require client certificates):")
        print("  python3 main.py")
        print("\nWith mTLS enabled, only clients with valid certs can connect:")
        print("  curl --cert certs/out/client-cert.pem \\")
        print("       --key certs/out/client-key.pem \\")
        print("       --cacert certs/out/ca-cert.pem \\")
        print("       https://localhost:9000/multiply?a=3&b=4")
        print("="*60 + "\n")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=9000,
            log_level="info"
        )
    else:
        # Production: HTTPS + mTLS client cert verification
        # Requires cert/key files (default: Let's Encrypt, can override with --cert/--key/--ca)
        if not os.path.exists(args.cert):
            print("\n" + "="*60)
            print("❌ HTTPS certificate not found!")
            print("="*60)
            print(f"Expected at: {args.cert}")
            print("\nTo set up Let's Encrypt certificate:")
            print("  ./setup-https.sh")
            print("\nOr use self-signed certs for testing:")
            print("  python3 main.py --cert certs/out/server-cert.pem \\")
            print("                   --key certs/out/server-key.pem \\")
            print("                   --ca certs/out/ca-cert.pem")
            print("="*60 + "\n")
            exit(1)

        print("\n" + "="*60)
        print("✅ MTLS ENABLED (mTLS required)")
        print("="*60)
        print("Server running with mutual TLS (client cert verification required)")
        print(f"Certificate: {args.cert}")
        print(f"Private Key: {args.key}")
        print(f"CA Cert:     {args.ca}")
        print("\nClients MUST present valid certificate signed by CA:")
        print("  curl --cert certs/out/client-cert.pem \\")
        print("       --key certs/out/client-key.pem \\")
        print("       --cacert certs/out/ca-cert.pem \\")
        print("       https://localhost:9000/multiply?a=3&b=4")
        print("\nWithout client cert, connection will be rejected.")
        print("To run in test mode (plain HTTP): python3 main.py --no-mtls")
        print("="*60 + "\n")

        uvicorn.run(
            app,
            host="0.0.0.0",
            port=9000,
            ssl_keyfile=args.key,
            ssl_certfile=args.cert,
            ssl_ca_certs=args.ca,
            ssl_cert_reqs="required",
            log_level="info"
        )
