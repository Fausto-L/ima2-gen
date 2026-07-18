import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { ProjectSearchPopup } from "./ProjectSearchPopup";

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export function ProjectSelect() {
  const { t } = useI18n();
  const folders = useAppStore((s) => s.assetsFolders);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);
  const loadAssetFolders = useAppStore((s) => s.loadAssetFolders);
  const createAssetFolder = useAppStore((s) => s.createAssetFolder);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadAssetFolders(); }, [loadAssetFolders]);

  // Reset stale selection when the folder disappears (deleted elsewhere).
  useEffect(() => {
    if (selectedProjectId && folders.length > 0 && !folders.some((f) => f.id === selectedProjectId)) {
      setSelectedProject(null);
    }
  }, [folders, selectedProjectId, setSelectedProject]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const roots = folders.filter((f) => f.parentId === null);
  const current = roots.find((f) => f.id === selectedProjectId);

  const onNewProject = async () => {
    const name = window.prompt(t("project.newPrompt"));
    if (!name || !name.trim()) return;
    const ok = await createAssetFolder(name.trim(), null);
    if (ok) {
      await loadAssetFolders();
      const created = useAppStore.getState().assetsFolders.find((f) => f.parentId === null && f.name === name.trim());
      if (created) setSelectedProject(created.id);
    }
    setOpen(false);
  };

  return (
    <div className="assetgen-field assetgen-project" ref={rootRef}>
      <span className="assetgen-field__label" id="assetgen-project-label">{t("project.select")}</span>
      <button
        type="button"
        className="assetgen-project__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="assetgen-project-label"
        onClick={() => setOpen((v) => !v)}
      >
        <IconFolder />
        {current ? current.name : t("project.unassigned")}
        <span className="assetgen-project__caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul className="assetgen-project__menu" role="listbox" aria-labelledby="assetgen-project-label">
          <li>
            <button type="button" aria-selected={selectedProjectId === null} onClick={() => { setSelectedProject(null); setOpen(false); }}>
              {t("project.unassigned")}
            </button>
          </li>
          {roots.map((f) => (
            <li key={f.id}>
              <button type="button" aria-selected={selectedProjectId === f.id} onClick={() => { setSelectedProject(f.id); setOpen(false); }}>
                {f.name}
              </button>
            </li>
          ))}
          <li className="assetgen-project__menu-divider" aria-hidden="true" />
          <li>
            <button type="button" onClick={() => void onNewProject()}>{t("project.new")}</button>
          </li>
          <li>
            <button type="button" onClick={() => { setOpen(false); setSearchOpen(true); }}>{t("project.search")}</button>
          </li>
        </ul>
      ) : null}
      {searchOpen ? (
        <ProjectSearchPopup onClose={() => setSearchOpen(false)} onSelect={(id) => setSelectedProject(id)} />
      ) : null}
    </div>
  );
}
