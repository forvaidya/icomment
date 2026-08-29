#!/usr/bin/env node
/**
 * IoT Device Simulator
 * Sends random payloads from 4 devices to /ingest endpoint
 * Random intervals (1-15 seconds), at least 1 msg/min per device
 */

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';
const DEVICES = [
  { id: 'sensor-lobby-1', type: 'temperature', token: 'iot-token-sensor-1' },
  { id: 'charger-parking-1', type: 'charger', token: 'iot-token-charger-1' },
  { id: 'lock-door-1', type: 'door-lock', token: 'iot-token-lock-1' },
  { id: 'counter-inventory-1', type: 'counter', token: 'iot-token-counter-1' }
];

interface SensorPayload {
  device_id: string;
  temperature?: number;
  humidity?: number;
}

interface ChargerPayload {
  device_id: string;
  voltage?: number;
  current?: number;
  status?: string;
}

interface DoorPayload {
  device_id: string;
  state?: 'locked' | 'unlocked' | 'jammed';
  battery?: number;
}

interface CounterPayload {
  device_id: string;
  count?: number;
  last_reset?: string;
}

type DevicePayload = SensorPayload | ChargerPayload | DoorPayload | CounterPayload;

function generatePayload(device: typeof DEVICES[0]): DevicePayload {
  switch (device.type) {
    case 'temperature':
      return {
        device_id: device.id,
        temperature: 20 + Math.random() * 10, // 20-30°C
        humidity: 40 + Math.random() * 30  // 40-70%
      };
    case 'charger':
      return {
        device_id: device.id,
        voltage: 220 + Math.random() * 20, // 220-240V
        current: 10 + Math.random() * 30,  // 10-40A
        status: Math.random() > 0.5 ? 'charging' : 'idle'
      };
    case 'door-lock':
      return {
        device_id: device.id,
        state: ['locked', 'unlocked', 'jammed'][Math.floor(Math.random() * 3)] as 'locked' | 'unlocked' | 'jammed',
        battery: 50 + Math.random() * 50  // 50-100%
      };
    case 'counter':
      return {
        device_id: device.id,
        count: Math.floor(Math.random() * 1000),
        last_reset: new Date(Date.now() - Math.random() * 86400000).toISOString()
      };
  }
}

async function sendMessage(device: typeof DEVICES[0]): Promise<void> {
  const payload = generatePayload(device);
  try {
    const res = await fetch(`${WORKER_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${device.token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`✓ ${device.id}: sent (msg_id: ${data.msg_id?.slice(0, 8)})`);
    } else {
      console.error(`✗ ${device.id}: ${data.error}`);
    }
  } catch (err) {
    console.error(`✗ ${device.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function randomInterval(min = 1000, max = 15000): number {
  return min + Math.random() * (max - min);
}

async function runDevice(device: typeof DEVICES[0]): Promise<void> {
  console.log(`📡 Starting ${device.id} (${device.type})`);

  // Send first message immediately
  await sendMessage(device);

  // Then send at random intervals
  setInterval(() => {
    sendMessage(device);
  }, randomInterval());
}

async function main(): Promise<void> {
  console.log(`🚀 IoT Device Simulator`);
  console.log(`🎯 Target: ${WORKER_URL}`);
  console.log(`📊 Devices: ${DEVICES.length}`);
  console.log(`⏱️  Random intervals: 1-15 seconds`);
  console.log(`---\n`);

  // Start all devices in parallel
  await Promise.all(DEVICES.map(device => runDevice(device)));

  console.log(`\n✅ All devices running. Press Ctrl+C to stop.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
