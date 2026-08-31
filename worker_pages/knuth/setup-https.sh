#!/bin/bash
set -E  # Keep error traps, but don't exit on every error

echo "Setting up Let's Encrypt HTTPS for knuth backend"
echo "=================================================="
echo ""
echo "Method: Manual DNS Validation"
echo "  - No port 80/443 required for validation"
echo "  - No API token needed"
echo "  - You manually add TXT record to Cloudflare DNS"
echo ""
echo "Prerequisites:"
echo "  1. Domain resolves: knuth.awanipro.com A 15.206.133.75 ✓"
echo "  2. Access to Cloudflare DNS (dash.cloudflare.com)"
echo "  3. Run as sudo"
echo ""
echo "What will happen:"
echo "  1. Certbot shows TXT record details to add"
echo "  2. You add TXT record: _acme-challenge.knuth.awanipro.com"
echo "  3. You press Enter to continue"
echo "  4. Let's Encrypt validates TXT record in DNS"
echo "  5. Certificate issued and saved to certs/out/"
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
echo ""
echo "Running certbot with manual DNS validation..."
echo "You will be asked to add a TXT record to your DNS."
echo ""

# Use manual DNS validation (user adds TXT record themselves)
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  --agree-tos \
  -m mahesh.vaidya.aitools@gmail.com \
  -d "$DOMAIN"

echo ""
echo "Checking for certificate..."
sleep 2  # Give certbot time to finalize

if [ -f "$CERT_PATH/fullchain.pem" ] && [ -f "$CERT_PATH/privkey.pem" ]; then
    echo "✅ Certificate found:"
    echo "  Cert: $CERT_PATH/fullchain.pem"
    echo "  Key:  $CERT_PATH/privkey.pem"
    echo ""

    # Copy to local certs/out directory with standard names
    OUT_DIR="$(cd "$(dirname "$0")" && pwd)/certs/out"
    mkdir -p "$OUT_DIR"

    echo "Copying to local certs/out/ with standard names..."
    sudo cp "$CERT_PATH/fullchain.pem" "$OUT_DIR/server-cert.pem" 2>/dev/null || {
        echo "Using sudo for copy..."
        sudo sh -c "cp $CERT_PATH/fullchain.pem $OUT_DIR/server-cert.pem"
    }
    sudo cp "$CERT_PATH/privkey.pem" "$OUT_DIR/server-key.pem" 2>/dev/null || {
        echo "Using sudo for key copy..."
        sudo sh -c "cp $CERT_PATH/privkey.pem $OUT_DIR/server-key.pem"
    }
    sudo chown $USER:$USER "$OUT_DIR/server-cert.pem" "$OUT_DIR/server-key.pem" 2>/dev/null || true

    # Verify files exist
    if [ -f "$OUT_DIR/server-cert.pem" ] && [ -f "$OUT_DIR/server-key.pem" ]; then
        echo ""
        echo "✅ Certificate ready to use:"
        echo "  Local cert: $OUT_DIR/server-cert.pem"
        echo "  Local key:  $OUT_DIR/server-key.pem"
        echo ""
        echo "✅ Ready to run:"
        echo "  python3 main.py"
        echo ""
        echo "Manual renewal: Re-run ./setup-https.sh before $(date -d '+89 days' '+%Y-%m-%d')"
    else
        echo "❌ Failed to copy certificate to certs/out/"
        echo "Try manually:"
        echo "  sudo cp $CERT_PATH/fullchain.pem certs/out/server-cert.pem"
        echo "  sudo cp $CERT_PATH/privkey.pem certs/out/server-key.pem"
        echo "  sudo chown $USER certs/out/server-*"
        exit 1
    fi
else
    echo "❌ Certificate not found at $CERT_PATH"
    echo "Check /var/log/letsencrypt/letsencrypt.log for errors"
    exit 1
fi
