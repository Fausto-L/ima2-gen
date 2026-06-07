import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";

const clients = new Set<WebSocket>();

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function createWsServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    (ws as any).isAlive = true;
    ws.on("pong", () => { (ws as any).isAlive = true; });
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  heartbeatTimer = setInterval(() => {
    for (const ws of clients) {
      if (!(ws as any).isAlive) { ws.terminate(); clients.delete(ws); continue; }
      (ws as any).isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on("close", () => {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  });

  return wss;
}

export function wsBroadcast(requestId: string, event: string, data: Record<string, unknown>) {
  const msg = JSON.stringify({ type: "event", requestId, event, data });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}
