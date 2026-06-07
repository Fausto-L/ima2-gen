export interface WsServerMessage {
  type: "event";
  requestId: string;
  event: string;
  data: Record<string, unknown>;
}

export type EventHandlerMap = Record<string, (data: Record<string, unknown>) => void>;
