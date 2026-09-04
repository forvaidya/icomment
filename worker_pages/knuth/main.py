import argparse
from fastapi import FastAPI
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

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

    print("\n" + "="*60)
    print("✅ BACKEND SERVER (Pure HTTP)")
    print("="*60)
    print("FastAPI running on http://0.0.0.0:9001 (internal only)")
    print("No TLS, no client cert validation")
    print("Protected by reverse proxy (Hono on :9000)")
    print("="*60 + "\n")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=9001,
        log_level="info"
    )
