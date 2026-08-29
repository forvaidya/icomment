#!/usr/bin/env node
/**
 * Setup IoT device tokens in KV
 * Run: npx ts-node scripts/setup-iot-tokens.ts
 */

const DEVICES = [
  { id: 'sensor-lobby-1', token: 'iot-token-sensor-1' },
  { id: 'charger-parking-1', token: 'iot-token-charger-1' },
  { id: 'lock-door-1', token: 'iot-token-lock-1' },
  { id: 'counter-inventory-1', token: 'iot-token-counter-1' }
];

async function setupTokens(): Promise<void> {
  console.log('🔑 IoT Token Setup\n');

  // Use wrangler KV API (requires environment setup)
  // For local dev, use: wrangler kv:key put --namespace-id={id} key value

  console.log('📋 Tokens to configure (add these via Cloudflare Dashboard or wrangler CLI):\n');

  for (const device of DEVICES) {
    console.log(`Device: ${device.id}`);
    console.log(`Token:  ${device.token}`);
    console.log(`KV Key: iot:tokens:${device.token}`);
    console.log(`KV Val: ${device.id}\n`);
  }

  console.log('Setup via wrangler CLI:');
  console.log('```');
  for (const device of DEVICES) {
    console.log(`npx wrangler kv:key put "iot:tokens:${device.token}" "${device.id}" --namespace-id={IOT_KV_ID}`);
  }
  console.log('```\n');

  console.log('Or add to wrangler.toml [[kv_namespaces]] section:');
  console.log('```');
  console.log('[env.iot-setup]\n');
  for (const device of DEVICES) {
    console.log(`# ${device.id}`);
    console.log(`[[env.iot-setup.kv_namespaces]]\n`);
    console.log(`binding = "IOT_KV"\n`);
    console.log(`key = "iot:tokens:${device.token}"\n`);
    console.log(`value = "${device.id}"\n`);
  }
  console.log('```');
}

setupTokens().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
