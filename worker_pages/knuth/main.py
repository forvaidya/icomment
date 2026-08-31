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
        print("\n" + "="*60)
        print("✅ MTLS ENABLED")
        print("="*60)
        print("Server running with mutual TLS (client cert verification required)")
        print("\nClients MUST present valid certificate signed by CA:")
        print("  curl --cert certs/out/client-cert.pem \\")
        print("       --key certs/out/client-key.pem \\")
        print("       --cacert certs/out/ca-cert.pem \\")
        print("       https://localhost:9000/multiply?a=3&b=4")
        print("\nWithout client cert, connection will be rejected.")
        print("To run in test mode (plain HTTP): python3 main.py --no-mtls")
        print("="*60 + "\n")
        certs_dir = os.path.join(os.path.dirname(__file__), "certs", "out")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=9000,
            ssl_keyfile=os.path.join(certs_dir, "server-key.pem"),
            ssl_certfile=os.path.join(certs_dir, "server-cert.pem"),
            ssl_ca_certs=os.path.join(certs_dir, "ca-cert.pem"),
            ssl_cert_reqs="required",
            log_level="info"
        )
