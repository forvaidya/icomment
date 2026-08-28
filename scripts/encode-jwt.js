#!/usr/bin/env node
/**
 * Convert JSON to JWT token
 * Usage: node encode-jwt.js
 *
 * Install: npm install jsonwebtoken
 */

const jwt = require('jsonwebtoken');

// Your JSON payload
const payload = {
  aud: ['90d83908bd9982a957925767d8d78895aa6f643850d83d0116730771344bb1e7'],
  email: 'forvaidya@gmail.com',
  exp: 1787935880,
  iat: 1787849480,
  nbf: 1787849480,
  iss: 'https://mahesh-demoz.cloudflareaccess.com',
  type: 'app',
  identity_nonce: 't2ag2zfwZ96xTuSS',
  sub: '27e34ed8-c5ce-571c-8165-9f0c2494d336',
  h_INTERNAL_DO_NOT_USE: 'psychomments.awanipro.com',
  country: 'IN',
  policy_id: '4196c262-24df-41d8-b565-db823b765c59'
};

// Secret key (change this!)
const SECRET_KEY = 'your-secret-key-here';

try {
  // Encode to JWT
  const token = jwt.sign(payload, SECRET_KEY, { algorithm: 'HS256' });

  console.log('✅ JWT Token Generated:\n');
  console.log(token);
  console.log('\n' + '='.repeat(80));
  console.log('Use this token in requests:');
  console.log('='.repeat(80));
  console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:8787/api/iot/token`);
  console.log('\n' + '='.repeat(80));
  console.log('Decoded (verify):');
  console.log('='.repeat(80));
  const decoded = jwt.verify(token, SECRET_KEY);
  console.log(JSON.stringify(decoded, null, 2));
} catch (err) {
  console.error('❌ Error:', err.message);
  console.error('\nInstall jsonwebtoken:');
  console.error('  npm install jsonwebtoken');
  process.exit(1);
}
