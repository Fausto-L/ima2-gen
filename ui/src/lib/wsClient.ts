import type { WsServerMessage, EventHandlerMap } from "./wsTypes";

type HandlerEntry = { handlers: EventHandlerMap };

const registry = new Map<string, HandlerEntry>();

let ws: WebSocket | null = null;
let backoff = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

function handleMessage(ev: MessageEvent) {
  let msg: WsServerMessage;
  try { msg = JSON.parse(ev.data as string); } catch { return; }
  if (msg.type !== "event") return;
  const entry = registry.get(msg.requestId);
  if (!entry) return;
  const handler = entry.handlers[msg.event];
  if (handler) handler(msg.data);
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(getWsUrl());
  } catch { scheduleReconnect(); return; }

  ws.addEventListener("open", () => { backoff = 1000; });
  ws.addEventListener("message", handleMessage);
  ws.addEventListener("close", () => scheduleReconnect());
  ws.addEventListener("error", () => { ws?.close(); });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoff = Math.min(backoff * 2, 30_000);
    connect();
  }, backoff);
}

export function ensureWs() { connect(); }

export function onEvent(requestId: string, handlers: EventHandlerMap): () => void {
  registry.set(requestId, { handlers });
  connect();
  return () => { registry.delete(requestId); };
}

ensureWs();
