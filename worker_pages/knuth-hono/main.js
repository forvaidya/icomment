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

    console.log(`Loaded CRL with ${serials.size} revoked certs`);
    return serials;
  } catch (e) {
    console.error('Failed to load CRL:', e.message);
    return new Set();
  }
}

let revokedSerials = loadCRL(crlFile);

// Simple HTTP handler
function requestHandler(req, res) {
  // Extract path and query
  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathname = url.pathname;
  const a = url.searchParams.get('a');
  const b = url.searchParams.get('b');

  // Reload CRL on each request
  revokedSerials = loadCRL(crlFile);

  // Check CRL
  const socket = req.socket;
  if (socket && socket.getPeerCertificate) {
    try {
      const cert = socket.getPeerCertificate();
      const serialNumber = cert.serialNumber?.toUpperCase();

      console.log(`[${pathname}] cert serial=${serialNumber}, revoked count=${revokedSerials.size}`);

      if (serialNumber && revokedSerials.has(serialNumber)) {
        console.warn(`BLOCKED: cert ${serialNumber} is revoked`);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Client certificate revoked' }));
        return;
      }

      console.log(`ALLOWED: cert ${serialNumber} not in CRL`);
    } catch (e) {
      console.error('Error checking CRL:', e.message);
    }
  }

  // Route /multiply
  if (pathname === '/multiply') {
    const numA = parseFloat(a);
    const numB = parseFloat(b);

    if (!Number.isFinite(numA) || !Number.isFinite(numB)) {
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameters a and b must be valid numbers' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ a: numA, b: numB, result: numA * numB }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
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
console.log('✅ HONO mTLS SERVER (Node.js + CRL checking)');
console.log('='.repeat(60));
console.log('Server running on https://0.0.0.0:9000');
console.log('mTLS + CRL checking enabled');
console.log('');
console.log('Test:');
console.log('  curl --cert ../knuth/certs/out/client-cert.pem \\');
console.log('       --key ../knuth/certs/out/client-key.pem \\');
console.log('       --cacert ../knuth/certs/out/ca-cert.pem \\');
console.log('       https://localhost:9000/multiply?a=3&b=4');
console.log('='.repeat(60) + '\n');

server.listen(9000);
