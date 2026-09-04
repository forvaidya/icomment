const https = require('https');
const fs = require('fs');
const path = require('path');

// Cert paths (hardcoded to reference Python version)
const CERT_DIR = '../knuth/certs/out';
const serverCert = path.resolve(CERT_DIR, 'server-cert.pem');
const serverKey = path.resolve(CERT_DIR, 'server-key.pem');
const caCert = path.resolve(CERT_DIR, 'ca-cert.pem');
const crlFile = path.resolve(CERT_DIR, 'crl.pem');

console.log('Cert paths:');
console.log('  Server cert:', serverCert, fs.existsSync(serverCert) ? '✓' : '✗');
console.log('  Server key:', serverKey, fs.existsSync(serverKey) ? '✓' : '✗');
console.log('  CA cert:', caCert, fs.existsSync(caCert) ? '✓' : '✗');
console.log('  CRL file:', crlFile, fs.existsSync(crlFile) ? '✓' : '✗');

// Load CRL and extract revoked serials
function loadCRL(crlPath) {
  if (!fs.existsSync(crlPath)) {
    console.warn('CRL not found:', crlPath);
    return new Set();
  }

  try {
    const crlText = fs.readFileSync(crlPath, 'utf8');
    const serials = new Set();

    const lines = crlText.split('\n');
    lines.forEach(line => {
      const match = line.match(/Serial Number:\s*([0-9A-Fa-f]+)/);
      if (match) {
        serials.add(match[1].toUpperCase());
      }
    });

    if (serials.size > 0) {
      console.log(`Loaded CRL with ${serials.size} revoked certs:`, Array.from(serials));
    } else {
      console.log('Loaded CRL with 0 revoked certs');
    }
    return serials;
  } catch (e) {
    console.error('Failed to load CRL:', e.message);
    return new Set();
  }
}

let revokedSerials = loadCRL(crlFile);

// Simple HTTP handler with reverse proxy
function requestHandler(req, res) {
  // Extract path and query
  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathname = url.pathname;

  // Reload CRL on each request
  revokedSerials = loadCRL(crlFile);

  // Check CRL
  const socket = req.socket;
  let serialNumber = 'unknown';
  if (socket && socket.getPeerCertificate) {
    try {
      const cert = socket.getPeerCertificate();
      console.log(`DEBUG: cert object=`, cert);
      console.log(`DEBUG: cert.serialNumber=`, cert.serialNumber);
      console.log(`DEBUG: typeof cert.serialNumber=`, typeof cert.serialNumber);

      serialNumber = cert.serialNumber;
      if (serialNumber) {
        // Try different formats
        if (typeof serialNumber === 'string') {
          serialNumber = serialNumber.toUpperCase();
        } else if (typeof serialNumber === 'number') {
          serialNumber = serialNumber.toString(16).toUpperCase();
        } else if (typeof serialNumber === 'bigint') {
          serialNumber = serialNumber.toString(16).toUpperCase();
        }
      }

      console.log(`[${pathname}] cert_serial=${serialNumber}, revoked_count=${revokedSerials.size}`);
      console.log(`[${pathname}] revoked_list=${Array.from(revokedSerials)}`);

      if (serialNumber && revokedSerials.has(serialNumber)) {
        console.warn(`BLOCKED: cert ${serialNumber} is revoked`);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Client certificate revoked' }));
        return;
      }

      console.log(`ALLOWED: cert ${serialNumber} not in CRL`);
    } catch (e) {
      console.error('Error checking CRL:', e.message, e.stack);
    }
  } else {
    console.warn(`No socket.getPeerCertificate available`);
  }

  // Proxy to backend (FastAPI on :9001)
  const backendUrl = `http://localhost:9001${url.pathname}${url.search}`;
  console.log(`Proxying ${pathname} to ${backendUrl}`);

  const httpReq = require('http').request(backendUrl, {
    method: req.method,
    headers: req.headers,
  }, (backendRes) => {
    res.writeHead(backendRes.statusCode, backendRes.headers);
    backendRes.pipe(res);
  });

  httpReq.on('error', (e) => {
    console.error('Backend error:', e.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Backend unavailable' }));
  });

  req.pipe(httpReq);
}

// HTTPS server with mTLS
const options = {
  key: fs.readFileSync(serverKey),
  cert: fs.readFileSync(serverCert),
  ca: fs.readFileSync(caCert),
  requestCert: true,
  rejectUnauthorized: true,
};

const server = https.createServer(options, requestHandler);

console.log('\n' + '='.repeat(60));
console.log('✅ REVERSE PROXY (mTLS + CRL checking)');
console.log('='.repeat(60));
console.log('Hono proxy on https://0.0.0.0:9000');
console.log('  ↓ (check CRL)');
console.log('FastAPI backend on http://localhost:9001 (internal)');
console.log('');
console.log('Test from client:');
console.log('  curl --cert ../knuth/certs/out/client-cert.pem \\');
console.log('       --key ../knuth/certs/out/client-key.pem \\');
console.log('       --cacert ../knuth/certs/out/ca-cert.pem \\');
console.log('       https://localhost:9000/multiply?a=3&b=4');
console.log('='.repeat(60) + '\n');

server.listen(9000);
