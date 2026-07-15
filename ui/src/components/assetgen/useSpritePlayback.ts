import { useCallback, useEffect, useRef, useState } from "react";

type PlaybackInput = { frameCount: number; fps: number; loop: boolean; speed: number; playing: boolean };

export function useSpritePlayback({ frameCount, fps, loop, speed, playing }: PlaybackInput) {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const timestampRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);
  const rafRef = useRef(0);

  const seek = useCallback((index: number) => {
    const next = frameCount > 0 ? Math.max(0, Math.min(frameCount - 1, index)) : 0;
    frameRef.current = next;
    setFrame((current) => current === next ? current : next);
    accumulatorRef.current = 0;
  }, [frameCount]);

  const step = useCallback((delta: -1 | 1) => {
    if (frameCount <= 0) return;
    const raw = frameRef.current + delta;
    const next = loop ? (raw + frameCount) % frameCount : Math.max(0, Math.min(frameCount - 1, raw));
    seek(next);
  }, [frameCount, loop, seek]);

  useEffect(() => {
    if (frameCount <= 0) seek(0);
    else if (frameRef.current >= frameCount) seek(frameCount - 1);
  }, [frameCount, seek]);

  useEffect(() => {
    timestampRef.current = null;
    accumulatorRef.current = 0;
    if (!playing || frameCount < 2 || fps <= 0 || speed <= 0) return;
    const interval = 1000 / (fps * speed);
    const tick = (timestamp: number) => {
      const previous = timestampRef.current;
      timestampRef.current = timestamp;
      if (previous !== null) accumulatorRef.current += Math.min(timestamp - previous, interval * 2);
      if (accumulatorRef.current >= interval) {
        accumulatorRef.current %= interval;
        const current = frameRef.current;
        const next = current + 1 >= frameCount ? (loop ? 0 : current) : current + 1;
        if (next !== current) {
          frameRef.current = next;
          setFrame(next);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fps, frameCount, loop, playing, speed]);

  return { frame, seek, step };
}
