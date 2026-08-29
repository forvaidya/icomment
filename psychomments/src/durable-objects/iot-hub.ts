// Durable Object for IoT real-time message broadcasting
// Stateless hub: devices POST /ingest → broadcast to all subscribers via WebSocket

export class IotHub {
  private state: any;
  private env: any;
  private connections: Set<any>;

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
    this.connections = new Set();
  }

  async fetch(req: any): Promise<any> {
    const url = new URL(req.url);

    // WebSocket upgrade for subscribers
    const upgradeHeader = req.headers.get('upgrade') || req.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      try {
        const pair = new (globalThis as any).WebSocketPair();
        pair[1].accept();
        this.handleWebSocket(pair[1]);
        return new Response(null, { status: 101, webSocket: pair[0] } as any);
      } catch (err) {
        console.error('WebSocket upgrade error:', err);
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
    }

    // Ingest endpoint (for device publishes)
    if (req.method === 'POST' && url.pathname === '/ingest') {
      try {
        const payload = await req.json();
        this.broadcast(payload);
        return new Response(JSON.stringify({ ok: true, device_id: payload.device_id }));
      } catch (err) {
        console.error('Ingest error:', err);
        return new Response(JSON.stringify({ error: 'Parse error' }), { status: 400 });
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  private handleWebSocket(ws: any) {
    try {
      this.connections.add(ws);

      ws.onmessage = (event: any) => {
        // Subscribers shouldn't send; just ignore
      };

      ws.onclose = () => {
        this.connections.delete(ws);
      };

      ws.onerror = (err: any) => {
        console.error('WebSocket error:', err);
        this.connections.delete(ws);
      };
    } catch (err) {
      console.error('WebSocket handling error:', err);
    }
  }

  private broadcast(msg: any) {
    const payload = JSON.stringify(msg);
    for (const ws of this.connections) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error('Send error:', err);
        this.connections.delete(ws);
      }
    }
  }
}
