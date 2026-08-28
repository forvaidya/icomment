# Barebone IoT Pattern - Architecture & Learning Guide

## Overview

A minimal, protocol-focused IoT platform that separates:
- **Universal layer** (infrastructure): device ingestion + real-time broadcast
- **Project layer** (semantics): business logic, storage, rules

This document covers the **universal layer**—what's identical across all IoT projects.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ PROJECT LAYER (application-specific)                 │
│ ├─ Business logic (EV vs Petrol, slot optimization)  │
│ ├─ Rules engine (if temp > 30, alert)                │
│ └─ Storage strategy (TSDB vs RDS vs KV)              │
├──────────────────────────────────────────────────────┤
│ UNIVERSAL LAYER (protocol/pattern - same everywhere) │
│ ├─ POST /ingest (device publishes data)              │
│ ├─ WebSocket /subscribe (client listens)             │
│ ├─ Real-time broadcast (all connected clients)       │
│ └─ Authentication (bearer token)                     │
├──────────────────────────────────────────────────────┤
│ INFRASTRUCTURE (Cloudflare)                          │
│ ├─ Durable Object (stateful broadcast hub)           │
│ ├─ Worker (HTTP request router)                      │
│ └─ KV/D1 (optional storage)                          │
└──────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Universal (Protocol Layer)

**These are identical for ALL IoT projects:**

| Concept | Definition | Example |
|---------|-----------|---------|
| **Device** | Anything that sends data | Sensor, EV charger, door lock |
| **Message** | Data from device | `{device_id, value, timestamp}` |
| **Ingestion** | How device sends data | HTTP POST to `/ingest` |
| **Subscription** | How clients receive data | WebSocket to `/subscribe` |
| **Broadcast** | Delivery to all subscribers | Message sent to all connected |
| **Authentication** | Device verification | Bearer token in header |

### Project-Specific (Semantics Layer)

**These change per project:**

| Aspect | Parking Lot | Hospital | Factory |
|--------|-------------|----------|---------|
| **Data schema** | `{charger_id, voltage, current}` | `{room_id, temp, humidity}` | `{conveyor_id, item_count}` |
| **Storage** | TSDB (time-series) | RDS (audit trail) | KV (real-time only) |
| **Rules** | if charge > 80% → disable | if temp > 25°C → alert | if items > 100 → pack |
| **Retention** | 30 days | 7 years | 1 day |

---

## API Endpoints

### Authentication

All IoT endpoints require bearer token authentication:

```bash
Authorization: Bearer {device_token}
```

Tokens are stored in `IOT_KV` namespace as: `iot:tokens:{token} → device_id`

**Token Sources:**

1. **User Login → Device Token** (for testing/dashboard)
   ```bash
   POST /api/iot/token
   Cf-Access-Jwt-Assertion: {user_jwt}
   
   Response: {
     "ok": true,
     "token": "uuid",
     "device_id": "user-{username}-{uuid}",
     "expires_in": 86400
   }
   ```

2. **Admin Setup** (hardcoded test tokens, dev/testing)
   ```bash
   POST /admin/iot/setup-tokens
   Cf-Access-Jwt-Assertion: {admin_jwt}  (or X-Dev-Override: true locally)
   
   Creates: iot-token-{type}-1 → {type}-{location}-1
   ```

3. **Predefined Device Tokens** (production)
   - Managed via dashboard or API
   - Scoped to device type + location
   - Can be rotated/revoked

**Flow:**
```
User logs in → JWT issued
  ↓
POST /api/iot/token with JWT → Device token generated
  ↓
Device token stored in IOT_KV
  ↓
Use device token to POST /ingest or GET /subscribe
  ↓
Token validated against IOT_KV on every request
```

### POST /ingest (Device publishes)

**Request:**
```bash
POST https://worker.com/ingest
Authorization: Bearer iot-token-sensor-1
Content-Type: application/json

{
  "device_id": "sensor-lobby-1",
  "temperature": 23.5,
  "humidity": 65
}
```

**Response:**
```json
{
  "ok": true,
  "device_id": "sensor-lobby-1",
  "msg_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Errors:**
- `401 Unauthorized: invalid or missing bearer token` — no auth header or token not found
- `401 Unauthorized: device_id mismatch` — payload device_id doesn't match token

**What happens:**
1. Worker validates bearer token against IOT_KV
2. Worker stores message in D1 (schemaless JSON)
3. Worker calls DO to broadcast
4. DO sends to all WebSocket subscribers
5. Returns success

### WebSocket /subscribe (Client listens)

**Connect:**
```bash
wss://worker.com/subscribe
Authorization: Bearer iot-token-sensor-1
```

**Receive (in real-time):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "sensor-lobby-1",
  "payload": {
    "temperature": 23.5,
    "humidity": 65
  },
  "timestamp": "2026-08-28T10:30:00Z"
}
```

**Errors:**
- `401 Unauthorized: invalid or missing bearer token` — no auth header or invalid token

**What happens:**
1. Client connects via WebSocket with bearer token
2. Worker validates token via validateIoTToken()
3. DO accepts connection, adds to connections Set
4. Any new POST /ingest broadcasts to all connected
5. Client receives in real-time
6. Closes when client disconnects (auto-cleanup)

---

## Durable Object (IoT Hub)

### Interface

```typescript
interface IoTHub {
  // Receive message from device (via Worker)
  POST /ingest → store + broadcast
  
  // Client subscribes to real-time stream
  GET /ws → WebSocket upgrade
}
```

### State Structure

```typescript
{
  connections: Set<WebSocket>,    // All connected clients
  messages: Map<id, message>,     // Last N messages (optional)
  metadata: Map<device_id, info>  // Device metadata (optional)
}
```

### Key Methods

```typescript
// Store message
receive(message) {
  this.state.messages.set(message.id, message)
}

// Broadcast to all subscribers
broadcast(message) {
  for (const ws of this.connections) {
    ws.send(JSON.stringify(message))
  }
}

// Handle new subscriber
subscribe(ws: WebSocket) {
  this.connections.add(ws)
  ws.onclose = () => this.connections.delete(ws)
}
```

---

## Implementation Checklist

### Phase 1: Core Protocol (Universal) ✅

- [x] DO with `connections: Set<WebSocket>` (IotHub class)
- [x] POST /ingest endpoint
- [x] DO.broadcast() method
- [x] WebSocket /subscribe endpoint
- [x] Test from desktop (curl + wscat)
- [x] D1 schema for schemaless JSON storage
- [x] Bearer token auth (device_id → IOT_KV)
- [x] Token validation on both endpoints
- [x] Setup endpoint for test tokens (admin)
- [x] Device simulator script with auth

### Phase 2: Optional State (Still Universal)

- [ ] Store last N messages in DO state
- [ ] Return message history on subscribe
- [ ] Message deduplication by ID
- [ ] Connection tracking (online/offline)

### Phase 3: Project-Specific (Application Layer)

- [ ] Define message schema for your domain
- [ ] Implement business rules (rules engine)
- [ ] Build visualization/dashboard UI
- [ ] Add alerting/notifications
- [ ] Query/analytics on D1 history

---

## Testing from Desktop

### Setup

```bash
# Terminal 1: Install WebSocket client
npm install -g wscat

# Terminal 2: Install HTTP client (or use curl)
# Already have curl

# Terminal 3: Install test device simulator (optional)
npm install -g ts-node
```

### Test Flow: Device Tokens (Admin Setup)

```bash
# Terminal 1: Setup tokens (admin only, dev override for local)
curl -X POST http://localhost:8787/admin/iot/setup-tokens \
  -H "X-Dev-Override: true"

# Terminal 2: Subscribe (listen for messages)
wscat -c ws://localhost:8787/subscribe \
  -H "Authorization: Bearer iot-token-sensor-1"

# Terminal 3: Publish (send data)
curl -X POST http://localhost:8787/ingest \
  -H "Authorization: Bearer iot-token-sensor-1" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sensor-lobby-1",
    "temperature": 23.5,
    "humidity": 65
  }'

# Terminal 2: Verify
# Should see message in real-time:
# {"id":"...","device_id":"sensor-lobby-1","payload":{...},"timestamp":"..."}
```

### Test Flow: User Login → Device Token

```bash
# Terminal 1: Get device token via login (simulated JWT)
JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJhdWQiOiJ0ZXN0In0.test"

curl -X POST http://localhost:8787/api/iot/token \
  -H "Cf-Access-Jwt-Assertion: $JWT"

# Response: {
#   "ok": true,
#   "token": "550e8400-e29b-41d4-a716-446655440000",
#   "device_id": "user-user-550e8400",
#   "expires_in": 86400
# }

TOKEN="550e8400-e29b-41d4-a716-446655440000"
DEVICE_ID="user-user-550e8400"

# Terminal 2: Subscribe with user device token
wscat -c ws://localhost:8787/subscribe \
  -H "Authorization: Bearer $TOKEN"

# Terminal 3: Post message using user device token
curl -X POST http://localhost:8787/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"message\":\"test\"}"

# Terminal 2: Verify
# Should see real-time message from user device
```

**Test auth rejection:**
```bash
# No token (should fail)
curl -X POST http://localhost:8787/ingest \
  -H "Content-Type: application/json" \
  -d '{"device_id":"sensor-lobby-1","temp":23}'
# Response: 401 {"error":"Unauthorized: invalid or missing bearer token"}

# Wrong token (should fail)
curl -X POST http://localhost:8787/ingest \
  -H "Authorization: Bearer wrong-token-xyz" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"sensor-lobby-1","temp":23}'
# Response: 401 {"error":"Unauthorized: invalid or missing bearer token"}
```

### Test Multiple Devices (Manual)

```bash
# Terminal 2: Device 1 (sensor)
for i in {1..10}; do
  curl -X POST http://localhost:8787/ingest \
    -H "Content-Type: application/json" \
    -d '{
      "device_id": "sensor-lobby-1",
      "temperature": '$((20 + RANDOM % 10))',
      "humidity": '$((40 + RANDOM % 30))'
    }'
  sleep 2
done

# Terminal 3: Device 2 (charger) - in parallel
for i in {1..10}; do
  curl -X POST http://localhost:8787/ingest \
    -H "Content-Type: application/json" \
    -d '{
      "device_id": "charger-parking-1",
      "voltage": '$((220 + RANDOM % 20))',
      "current": '$((10 + RANDOM % 30))''
    }'
  sleep 3
done

# Terminal 1: Verify (should see both device messages)
# {"id":"...","device_id":"sensor-lobby-1","timestamp":"...","payload":{...}}
# {"id":"...","device_id":"charger-parking-1","timestamp":"...","payload":{...}}
```

### Test with Device Simulator (Automated)

```bash
# Terminal 2: Run device simulator (4 devices, random intervals)
WORKER_URL=http://localhost:8787 npx ts-node scripts/iot-test-devices.ts

# Terminal 1: Subscribe and watch real-time stream
wscat -c ws://localhost:8787/subscribe

# Should see messages flowing in real-time from all 4 devices
```

**Devices simulated:**
- `sensor-lobby-1` — temperature/humidity (1-15s random intervals)
- `charger-parking-1` — voltage/current (1-15s random intervals)
- `lock-door-1` — door state/battery (1-15s random intervals)
- `counter-inventory-1` — item count (1-15s random intervals)

---

## Namespace & Naming

### Durable Object

```typescript
// Durable Object: IotHub
export class IotHub {
  private connections: Set<WebSocket>;
  
  async fetch(req: Request) {
    const url = new URL(req.url);
    
    if (url.pathname === '/ingest' && req.method === 'POST') {
      return this.handleIngest(req);
    }
    
    if (url.pathname === '/subscribe' && req.method === 'GET') {
      return this.handleWebSocket(req);
    }
    
    return new Response('Not Found', { status: 404 });
  }
}
```

### Worker Routes

```typescript
app.post('/ingest', async (c) => {
  const iotHub = c.env.IOT_HUB;
  const req = c.req.raw;
  return iotHub.fetch(new Request('http://internal/ingest', {
    method: 'POST',
    body: await c.req.text(),
    headers: req.headers
  }));
});

app.get('/subscribe', async (c) => {
  const iotHub = c.env.IOT_HUB;
  const req = c.req.raw;
  return iotHub.fetch(new Request('http://internal/subscribe', {
    method: 'GET',
    headers: req.headers
  }));
});
```

### wrangler.toml Binding

```toml
[[durable_objects.bindings]]
name = "IOT_HUB"
class_name = "IotHub"
script_name = "psychomments"

[[migrations]]
tag = "v1-iot-hub"
new_sqlite_classes = ["IotHub"]
```

### KV Namespacing (if using KV for auth tokens)

```
iot:tokens:{device_token} → {device_id, device_name, created_at}
iot:devices:{device_id} → {name, type, created_at}
iot:messages:{timestamp} → [messages for that minute]
```

---

## Data Flow Diagram

```
Device (Parking charger)
    ↓
    POST /ingest
    {device_id: "charger-1", voltage: 240, current: 32}
    ↓
Worker validates token
    ↓
Worker calls IotHub.fetch()
    ↓
IotHub.receive()
    ├─ Store in messages Map
    └─ Call broadcast()
    ↓
broadcast()
    ├─ For each WebSocket connection
    ├─ ws.send(JSON.stringify(message))
    ↓
Browser receives (real-time)
    ├─ Parse message
    ├─ Update UI
    └─ Application logic decides action
        (e.g., "voltage too high, alert operator")
```

---

## Key Principles

### Universal (Never changes)
- ✅ HTTP POST for device publish
- ✅ WebSocket for client subscribe
- ✅ Real-time broadcast pattern
- ✅ Bearer token authentication
- ✅ Message ID for deduplication

### Project-Specific (Changes per domain)
- ❌ Message schema (what fields matter)
- ❌ Storage backend (KV vs D1 vs TSDB)
- ❌ Rules logic (if X then Y)
- ❌ Retention policy (1 day vs 1 year)
- ❌ Alerting strategy (email vs SMS)
- ❌ UI/visualization

---

## Next Steps

1. **Build barebone** (just protocol, no UI)
2. **Test from desktop** (curl + wscat)
3. **Add project semantics** (your business logic)
4. **Add storage** (KV or D1 for persistence)
5. **Add visualization** (UI for operators)

---

## References

- [AWS IoT Core comparison](BAREBONE_IOT_PATTERN.md#aws-comparison)
- [Cloudflare Workers](https://workers.cloudflare.com)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
