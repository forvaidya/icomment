// Durable Object for global real-time chat broadcasting
// Stateless broadcast hub: receives message → broadcasts to all connected clients

export class GlobalChat {
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

    // WebSocket upgrade
    const upgradeHeader = req.headers.get('upgrade') || req.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      try {
        // Create WebSocket pair (client for browser, server for DO)
        const pair = new (globalThis as any).WebSocketPair();

        // Accept connection on server side
        pair[1].accept();

        // Add handlers
        this.handleWebSocket(pair[1]);

        // Return client side to browser
        return new Response(null, { status: 101, webSocket: pair[0] } as any);
      } catch (err) {
        console.error('WebSocket upgrade error:', err);
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
    }

    // Broadcast endpoint (for internal calls)
    if (req.method === 'POST' && url.pathname === '/broadcast') {
      try {
        const msgHeader = req.headers.get('X-Message');
        if (!msgHeader) {
          return new Response(JSON.stringify({ error: 'Missing X-Message header' }), { status: 400 });
        }
        const msg = JSON.parse(msgHeader);
        this.broadcast(msg);
      } catch (err) {
        console.error('Broadcast error:', err);
        return new Response(JSON.stringify({ error: 'Parse error' }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true }));
    }

    return new Response('Not Found', { status: 404 });
  }

  private handleWebSocket(ws: any) {
    try {
      this.connections.add(ws);

      ws.onmessage = (event: any) => {
        try {
          const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          this.broadcast(msg);
        } catch (err) {
          console.error('Message parse error:', err);
        }
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
