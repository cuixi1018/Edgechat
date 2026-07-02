const INTERNAL_AUTH_HEADER = 'x-cfchat-internal-auth';
const VERIFIED_USER_ID_HEADER = 'x-cfchat-verified-user-id';

function parseVerifiedUserId(request) {
  if (request.headers.get(INTERNAL_AUTH_HEADER) !== 'worker-verified') {
    return null;
  }

  const userId = Number(request.headers.get(VERIFIED_USER_ID_HEADER) || '');
  return Number.isFinite(userId) ? userId : null;
}

export class UserInbox {
  constructor(state) {
    this.state = state;
    this.connections = new Set();

    for (const socket of this.state.getWebSockets()) {
      this.connections.add(socket);
    }
  }

  broadcast(packet) {
    for (const socket of this.connections) {
      try {
        socket.send(packet);
      } catch {
        this.connections.delete(socket);
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      const userId = parseVerifiedUserId(request);
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected websocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ userId });
      this.connections.add(server);
      server.send(JSON.stringify({ type: 'ready' }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/notify' && request.method === 'POST') {
      if (request.headers.get(INTERNAL_AUTH_HEADER) !== 'worker-verified') {
        return new Response('Unauthorized', { status: 401 });
      }

      const payload = await request.json();
      this.broadcast(JSON.stringify(payload));
      return Response.json({ ok: true });
    }

    return new Response('Not Found', { status: 404 });
  }

  webSocketClose(ws) {
    this.connections.delete(ws);
  }

  webSocketError(ws) {
    this.connections.delete(ws);
  }
}
