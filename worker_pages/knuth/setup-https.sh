#!/bin/bash
set -e

echo "Setting up Let's Encrypt HTTPS for knuth backend"
echo "=================================================="
echo ""
echo "Prerequisites:"
echo "  1. Domain 'knuth.awanipro.com' must resolve to this server"
echo "  2. Ports 80 and 443 must be open (for certbot validation)"
echo "  3. Run as root or with sudo"
echo ""
echo "If you haven't set DNS yet, add A record:"
echo "  knuth.awanipro.com A 15.206.133.75"
echo ""
read -p "Press enter to continue (or Ctrl+C to cancel)..."

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    sudo apt-get update
    sudo apt-get install -y certbot
fi

# Get certificate
DOMAIN="knuth.awanipro.com"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo ""
echo "Getting certificate from Let's Encrypt for $DOMAIN..."
sudo certbot certonly --standalone --non-interactive --agree-tos \
  -m mahesh.vaidya.aitools@gmail.com \
  -d "$DOMAIN"

if [ -d "$CERT_PATH" ]; then
    echo ""
    echo "✅ Certificate installed:"
    echo "  Cert: $CERT_PATH/fullchain.pem"
    echo "  Key:  $CERT_PATH/privkey.pem"
    echo ""

    # Copy to local certs/out directory with standard names
    OUT_DIR="$(cd "$(dirname "$0")" && pwd)/certs/out"
    mkdir -p "$OUT_DIR"

    echo "Copying to local certs/out/ with standard names..."
    sudo cp "$CERT_PATH/fullchain.pem" "$OUT_DIR/server-cert.pem"
    sudo cp "$CERT_PATH/privkey.pem" "$OUT_DIR/server-key.pem"
    sudo chown $USER:$USER "$OUT_DIR/server-cert.pem" "$OUT_DIR/server-key.pem"

    echo ""
    echo "✅ Ready to use:"
    echo "  python3 main.py --cert certs/out/server-cert.pem \\"
    echo "                   --key certs/out/server-key.pem \\"
    echo "                   --ca certs/out/ca-cert.pem"
    echo ""
    echo "Auto-renewal: certbot will auto-update $CERT_PATH/ (copy to certs/out manually after renewal)"
else
    echo "❌ Certificate setup failed"
    exit 1
fi
