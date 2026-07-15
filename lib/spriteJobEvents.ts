import type { Response } from "express";
import { publish } from "./eventBus.js";
import { writeSse } from "./routeHelpers.js";
import { publishJobEvent } from "./ssePublish.js";
export type SpriteJobEventName = "phase" | "row" | "partial" | "image" | "error" | "done";
export interface SpriteJobEmitter { emit(event: SpriteJobEventName, data: Record<string, unknown>): boolean; end(): void }
export function createSpriteJobEmitter(res: Response, requestId: string): SpriteJobEmitter { return { emit(event, data) { const wrote = !res.writableEnded ? writeSse(res, event, data) : false; const published = event === "done" ? publishJobEvent(requestId, event, data) : (publish(requestId, event, data), true); return wrote || published; }, end() { if (!res.writableEnded) res.end(); } }; }
