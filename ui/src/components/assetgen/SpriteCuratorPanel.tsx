import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import {
  bakeSpriteAtlas,
  exportSpriteContactSheet,
  exportSpriteGif,
  getSpriteAtlasRun,
  saveSpriteCuration,
} from "../../lib/api-sprite-atlas";
import { normalizeSpriteTransform } from "../../lib/spriteTransform";
import { useAppStore } from "../../store/useAppStore";
import type {
  SpriteAtlasRunDto,
  SpriteCuration,
  SpriteCurationState,
  SpriteFrameTransform,
  SpriteFrameView,
} from "../../types/spriteAtlas";
import { useAgentDialogFocus } from "../agent/useAgentDialogFocus";
import { SpriteFrameRail } from "./SpriteFrameRail";
import { SpriteSequencePreview } from "./SpriteSequencePreview";
import { useSpritePlayback } from "./useSpritePlayback";
import "../../styles/sprite-curator.css";

type Status = "loading" | "ready" | "saving" | "baking" | "exporting" | "error";

function initialCuration(run: SpriteAtlasRunDto): SpriteCuration {
  return run.curation ?? { version: 1, kind: "sprite-gen-curation", states: {} };
}

function resolveState(state: SpriteCurationState | undefined, count: number) {
  const all = Array.from({ length: count }, (_, index) => index);
  const deleted = new Set((state?.deleted ?? []).filter((index) => all.includes(index)));
  const visible = all.filter((index) => !deleted.has(index));
  const selectedInput = state?.selected?.length ? state.selected : visible;
  const selected = selectedInput.filter((index, at) => visible.includes(index) && selectedInput.indexOf(index) === at);
  const ordered = (state?.order ?? []).filter((index, at, values) => visible.includes(index) && values.indexOf(index) === at);
  for (const index of visible) if (!ordered.includes(index)) ordered.push(index);
  return { selected, candidates: ordered.filter((index) => !selected.includes(index)), deleted: [...deleted] };
}

function moveBefore(values: number[], frameIndex: number, beforeFrameIndex: number | null) {
  const next = values.filter((value) => value !== frameIndex);
  const position = beforeFrameIndex === null ? next.length : next.indexOf(beforeFrameIndex);
  next.splice(position < 0 ? next.length : position, 0, frameIndex);
  return next;
}

export function SpriteCuratorPanel() {
  const { t } = useI18n();
  const target = useAppStore((state) => state.spriteCuratorTarget);
  const setTarget = useAppStore((state) => state.setCuratorTarget);
  const [run, setRun] = useState<SpriteAtlasRunDto | null>(null);
  const [curation, setCuration] = useState<SpriteCuration | null>(null);
  const [activeState, setActiveState] = useState("");
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    if (!target) return;
    let active = true;
    setStatus("loading");
    setError(null);
    getSpriteAtlasRun(target.runId).then((value) => {
      if (!active) return;
      const states = Object.keys(value.manifest.frame_layout.rows);
      setRun(value);
      setCuration(initialCuration(value));
      setActiveState(states[0] ?? "");
      setActiveFrame(0);
      setDirty(false);
      setStatus("ready");
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : t("spriteCurator.loadError"));
      setStatus("error");
    });
    return () => { active = false; };
  }, [t, target]);

  const close = useCallback(() => {
    if (dirty && !window.confirm(t("spriteCurator.discardConfirm"))) return;
    setTarget(null);
  }, [dirty, setTarget, t]);
  const panelRef = useAgentDialogFocus(Boolean(target), close);

  const rects = run?.manifest.frame_layout.rows[activeState] ?? [];
  const statePlan = useMemo(
    () => resolveState(curation?.states[activeState], rects.length),
    [activeState, curation, rects.length],
  );
  const row = run?.manifest.animation.rows[activeState];
  const playback = useSpritePlayback({
    frameCount: statePlan.selected.length,
    fps: row?.fps ?? 8,
    loop: row?.loop ?? true,
    speed,
    playing,
  });

  useEffect(() => {
    const index = statePlan.selected[playback.frame];
    if (index !== undefined) setActiveFrame(index);
  }, [playback.frame, statePlan.selected]);

  const updateState = useCallback((selected: number[], candidates: number[], deleted = statePlan.deleted) => {
    setCuration((current) => {
      if (!current) return current;
      const previous = current.states[activeState] ?? {};
      return {
        ...current,
        states: {
          ...current.states,
          [activeState]: { ...previous, selected, order: [...selected, ...candidates], deleted },
        },
      };
    });
    setDirty(true);
  }, [activeState, statePlan.deleted]);

  const reorder = (kind: "sequence" | "candidates", frameIndex: number, before: number | null) => {
    if (kind === "sequence") updateState(moveBefore(statePlan.selected, frameIndex, before), statePlan.candidates);
    else updateState(statePlan.selected, moveBefore(statePlan.candidates, frameIndex, before));
  };
  const move = (frameIndex: number, destination: "sequence" | "candidates") => {
    if (destination === "sequence") {
      updateState([...statePlan.selected, frameIndex], statePlan.candidates.filter((index) => index !== frameIndex));
    } else if (statePlan.selected.length > 1) {
      updateState(statePlan.selected.filter((index) => index !== frameIndex), [...statePlan.candidates, frameIndex]);
    }
  };
  const remove = (frameIndex: number) => {
    if (statePlan.selected.includes(frameIndex) && statePlan.selected.length === 1) return;
    updateState(
      statePlan.selected.filter((index) => index !== frameIndex),
      statePlan.candidates.filter((index) => index !== frameIndex),
      [...new Set([...statePlan.deleted, frameIndex])],
    );
  };

  const transforms = curation?.states[activeState]?.transforms ?? {};
  const activeTransform = normalizeSpriteTransform(activeFrame === null ? {} : transforms[String(activeFrame)] ?? {});
  const updateTransform = (patch: Partial<SpriteFrameTransform>) => {
    if (activeFrame === null) return;
    setCuration((current) => current ? ({
      ...current,
      states: {
        ...current.states,
        [activeState]: {
          ...current.states[activeState],
          transforms: {
            ...current.states[activeState]?.transforms,
            [String(activeFrame)]: { ...activeTransform, ...patch },
          },
        },
      },
    }) : current);
    setDirty(true);
  };

  const save = async () => {
    if (!target || !curation) return;
    try {
      setStatus("saving"); setError(null);
      await saveSpriteCuration(target.runId, curation);
      setDirty(false); setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("spriteCurator.saveError")); setStatus("error");
    }
  };
  const bake = async () => {
    if (!target || !curation) return;
    try {
      setStatus("baking"); setError(null);
      if (dirty) await saveSpriteCuration(target.runId, curation);
      await bakeSpriteAtlas(target.runId);
      setDirty(false); setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("spriteCurator.bakeError")); setStatus("error");
    }
  };
  const exportAsset = async (kind: "contact" | "gif") => {
    if (!target) return;
    try {
      setStatus("exporting"); setError(null);
      const result = kind === "contact"
        ? await exportSpriteContactSheet(target.runId, activeState)
        : await exportSpriteGif(target.runId, activeState);
      const url = result.url ?? (result.filePath ? `/generated/${encodeURIComponent(result.filePath)}` : null);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("spriteCurator.exportError")); setStatus("error");
    }
  };

  if (!target) return null;
  const frameView = (index: number): SpriteFrameView => ({
    index,
    rect: rects[index],
    atlasUrl: run?.atlasUrl ?? `/generated/${encodeURIComponent(target.atlasFile)}`,
    sheetWidth: run?.manifest.frame_layout.sheetWidth ?? 1,
    sheetHeight: run?.manifest.frame_layout.sheetHeight ?? 1,
  });
  const sequence = statePlan.selected.map(frameView);
  const candidates = statePlan.candidates.map(frameView);
  const busy = status === "loading" || status === "saving" || status === "baking" || status === "exporting";

  return (
    <div className="sprite-curator" role="presentation">
      <button type="button" className="sprite-curator__backdrop" aria-label={t("spriteCurator.close")} onClick={close} />
      <div ref={panelRef} className="sprite-curator__panel" role="dialog" aria-modal="true" aria-labelledby="sprite-curator-title">
        <header className="sprite-curator__header">
          <h2 id="sprite-curator-title">{t("spriteCurator.title")}</h2>
          <select aria-label={t("spriteCurator.state")} value={activeState} onChange={(event) => { setActiveState(event.target.value); setActiveFrame(0); playback.seek(0); }}>
            {Object.keys(run?.manifest.frame_layout.rows ?? {}).map((state) => <option key={state}>{state}</option>)}
          </select>
          <span role="status">{dirty ? t("spriteCurator.unsaved") : t(`spriteCurator.status.${status}`)}</span>
          <button type="button" onClick={close}>{t("spriteCurator.close")}</button>
        </header>
        {error ? <p className="sprite-curator__error" role="alert">{error}</p> : null}
        {run && curation ? (
          <div className="sprite-curator__body">
            <section className="sprite-curator__preview">
              <SpriteSequencePreview
                atlasUrl={run.atlasUrl}
                frames={sequence.map((frame) => ({ frameIndex: frame.index, rect: frame.rect }))}
                cell={{ width: run.manifest.frame_layout.cellWidth, height: run.manifest.frame_layout.cellHeight }}
                transforms={transforms}
                currentFrame={playback.frame}
                showGrid={showGrid}
              />
              <div className="sprite-curator__playback">
                <button type="button" onClick={() => playback.step(-1)}>{t("spriteCurator.previous")}</button>
                <button type="button" aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>{t(playing ? "spriteCurator.pause" : "spriteCurator.play")}</button>
                <button type="button" onClick={() => playback.step(1)}>{t("spriteCurator.next")}</button>
                <label>{t("spriteCurator.speed")}<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[.25, .5, 1, 2, 4].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
                <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />{t("spriteCurator.grid")}</label>
              </div>
            </section>
            <fieldset className="sprite-curator__inspector" disabled={activeFrame === null}>
              <legend>{t("spriteCurator.transform")}</legend>
              {(["rotate", "scale", "dx", "dy", "shx", "shy"] as const).map((key) => (
                <label key={key}>{t(`spriteCurator.${key}`)}<input type="number" step={key === "scale" ? .05 : key.startsWith("sh") ? .05 : 1} value={activeTransform[key]} onChange={(event) => updateTransform({ [key]: Number(event.target.value) })} /></label>
              ))}
              <label><input type="checkbox" checked={activeTransform.flipX === 1} onChange={(event) => updateTransform({ flipX: event.target.checked ? 1 : 0 })} />{t("spriteCurator.flipX")}</label>
            </fieldset>
            <div className="sprite-curator__rails">
              <h3>{t("spriteCurator.sequence")}</h3>
              <SpriteFrameRail kind="sequence" frames={sequence} activeFrameIndex={activeFrame} onActivate={setActiveFrame} onReorder={(frame, before) => reorder("sequence", frame, before)} onMove={move} onDelete={remove} />
              <h3>{t("spriteCurator.candidates")}</h3>
              <SpriteFrameRail kind="candidates" frames={candidates} activeFrameIndex={activeFrame} onActivate={setActiveFrame} onReorder={(frame, before) => reorder("candidates", frame, before)} onMove={move} onDelete={remove} />
            </div>
          </div>
        ) : <p role="status">{t("spriteCurator.status.loading")}</p>}
        <footer className="sprite-curator__footer">
          <button type="button" disabled={busy || !dirty} onClick={() => void save()}>{t("spriteCurator.save")}</button>
          <button type="button" disabled={busy} onClick={() => void bake()}>{t("spriteCurator.bake")}</button>
          <button type="button" disabled={busy} onClick={() => void exportAsset("contact")}>{t("spriteCurator.contactSheet")}</button>
          <button type="button" disabled={busy} onClick={() => void exportAsset("gif")}>{t("spriteCurator.gif")}</button>
        </footer>
      </div>
    </div>
  );
}
