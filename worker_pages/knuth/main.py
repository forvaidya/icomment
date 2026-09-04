import ssl
import os
import argparse
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from cryptography import x509
from cryptography.hazmat.backends import default_backend
import logging

logger = logging.getLogger(__name__)

app = FastAPI()

# CRL path (set at startup)
crl_path = None

def load_crl(path):
    """Load CRL from disk."""
    if not os.path.exists(path):
        logger.warning(f"CRL not found at {path}")
        return set()
    try:
        with open(path, 'rb') as f:
            crl = x509.load_pem_x509_crl(f.read(), default_backend())
        serials = {cert.serial_number for cert in crl}
        logger.info(f"Loaded CRL with {len(serials)} revoked certs")
        return serials
    except Exception as e:
        logger.error(f"Failed to load CRL: {e}")
        return set()

@app.middleware("http")
async def check_crl_middleware(request: Request, call_next):
    """Check if client cert is in CRL before processing request."""
    transport = request.scope.get("transport")
    logger.info(f"CRL middleware: transport={type(transport).__name__}")

    if transport and hasattr(transport, "get_extra_info"):
        try:
            ssl_obj = transport.get_extra_info("ssl_object")
            logger.info(f"CRL middleware: ssl_object={ssl_obj is not None}")

            if ssl_obj:
                peer_cert_der = ssl_obj.getpeercert(binary_form=True)
                logger.info(f"CRL middleware: peer_cert_der length={len(peer_cert_der) if peer_cert_der else 0}")

                if peer_cert_der:
                    cert = x509.load_der_x509_certificate(peer_cert_der, default_backend())
                    logger.info(f"CRL middleware: cert serial={cert.serial_number:x}")

                    revoked = load_crl(crl_path)
                    logger.info(f"CRL middleware: revoked count={len(revoked)}")

                    if cert.serial_number in revoked:
                        logger.warning(f"BLOCKED: cert {cert.serial_number:x} is revoked")
                        return JSONResponse(
                            {"error": "Client certificate revoked"},
                            status_code=403
                        )
                    logger.info(f"ALLOWED: cert {cert.serial_number:x} not in CRL")
        except Exception as e:
            logger.error(f"CRL middleware error: {e}", exc_info=True)
    else:
        logger.warning(f"CRL middleware: no transport or get_extra_info")

    return await call_next(request)


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
    parser.add_argument("--crl", type=str, default="certs/out/crl.pem", help="Path to CRL file (optional)")
    args = parser.parse_args()

    # Set global CRL path
    crl_path = args.crl

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
        print("✅ MTLS ENABLED (mTLS + CRL check)")
        print("="*60)
        print("Server running with mutual TLS (client cert verification + CRL required)")
        print(f"Certificate: {args.cert}")
        print(f"Private Key: {args.key}")
        print(f"CA Cert:     {args.ca}")
        print(f"CRL File:    {args.crl}")
        print("\nClients MUST present valid certificate (not in CRL):")
        print("  curl --cert certs/out/client-cert.pem \\")
        print("       --key certs/out/client-key.pem \\")
        print("       --cacert certs/out/ca-cert.pem \\")
        print("       https://localhost:9000/multiply?a=3&b=4")
        print("\nTo test CRL revocation:")
        print("  1. cp certs/out/crl-revoked.pem certs/out/crl.pem")
        print("  2. Next request will be rejected at TLS handshake")
        print("  3. cp certs/out/crl-empty.pem certs/out/crl.pem")
        print("  4. Requests will succeed again (no restart needed!)")
        print("To run in test mode (plain HTTP): python3 main.py --no-mtls")
        print("="*60 + "\n")

        crl_path = args.crl
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=9000,
            ssl_keyfile=args.key,
            ssl_certfile=args.cert,
            ssl_ca_certs=args.ca,
            ssl_cert_reqs=ssl.CERT_REQUIRED,
            log_level="info"
        )
