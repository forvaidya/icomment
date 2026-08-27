// Durable Object for global real-time chat broadcasting
// Stateless broadcast hub: receives message → broadcasts to all connected clients

export class GlobalChat {
  private state: any;
  private connections: Set<any>;

  constructor(state: any) {
    this.state = state;
    this.connections = new Set();
  }

  async fetch(req: any): Promise<any> {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (req.headers.get('upgrade') === 'websocket') {
      const { 0: client, 1: server } = new Object() as any;

      try {
        // Use Cloudflare's WebSocket pair
        const pair = (globalThis as any).WebSocketPair
          ? new (globalThis as any).WebSocketPair()
          : { 0: null, 1: null };

        if (!pair[0] || !pair[1]) {
          return new Response('WebSocket upgrade failed', { status: 400 });
        }

        this.handleWebSocket(pair[1]);
        return new Response(null, { status: 101, webSocket: pair[0] } as any);
      } catch (err) {
        console.error('WebSocket error:', err);
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
    }

    // Broadcast endpoint (for internal calls)
    if (req.method === 'POST' && url.pathname === '/broadcast') {
      const msg = await req.json();
      this.broadcast(msg);
      return new Response(JSON.stringify({ ok: true }));
    }

    return new Response('Not Found', { status: 404 });
  }

  private handleWebSocket(ws: any) {
    try {
      ws.accept();
      this.connections.add(ws);

      // Message handler
      ws.onmessage = (event: any) => {
        try {
          const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          // Broadcast to all connected (including sender)
          this.broadcast(msg);
        } catch (err) {
          console.error('Invalid message:', err);
        }
      };

      // Close handler
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
