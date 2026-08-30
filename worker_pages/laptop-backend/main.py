import ssl
import os
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

    # TEST MODE: Run plain HTTP (no mTLS verification)
    # For production, use HTTPS + client cert verification (see commented code below)
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=9000,
        log_level="info"
    )

    # Production mode (uncomment to enable mTLS):
    # certs_dir = os.path.join(os.path.dirname(__file__), "certs", "out")
    # ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    # ssl_context.load_cert_chain(
    #     certfile=os.path.join(certs_dir, "server-cert.pem"),
    #     keyfile=os.path.join(certs_dir, "server-key.pem")
    # )
    # ssl_context.verify_mode = ssl.CERT_REQUIRED
    # ssl_context.load_verify_locations(os.path.join(certs_dir, "ca-cert.pem"))
    # uvicorn.run(
    #     app,
    #     host="0.0.0.0",
    #     port=9000,
    #     ssl_keyfile=os.path.join(certs_dir, "server-key.pem"),
    #     ssl_certfile=os.path.join(certs_dir, "server-cert.pem"),
    #     ssl_ca_certs=os.path.join(certs_dir, "ca-cert.pem"),
    #     ssl_cert_reqs=ssl.CERT_REQUIRED,
    #     log_level="info"
    # )
