import { AgentFormTemplatePanel } from "./AgentFormTemplatePanel";
import { CloseIcon } from "./AgentIcons";
import { AgentImagePane } from "./AgentImagePane";
import { AgentModelSelector } from "./AgentModelSelector";
import { AgentPromptLibraryPanel } from "./AgentPromptLibraryPanel";
import { AgentQualityPanel } from "./AgentQualityPanel";
import { AgentQueuePanel } from "./AgentQueuePanel";
import { AgentSidebarTabs } from "./AgentSidebarTabs";
import { useAgentDialogFocus } from "./useAgentDialogFocus";
import { useI18n } from "../../i18n";
import type {
  AgentContextTab,
  AgentGenerationSettings,
  AgentImageHandle,
  AgentQueueItem,
  AgentSessionRunSummary,
  AgentSidebarTab,
} from "./agentTypes";

type SidebarBodyProps = {
  currentImage: AgentImageHandle | null;
  images: AgentImageHandle[];
  contextTab: AgentContextTab;
  sidebarTab: AgentSidebarTab;
  queueItems: AgentQueueItem[];
  runSummary?: AgentSessionRunSummary;
  settings: AgentGenerationSettings;
  onContextTabChange: (tab: AgentContextTab) => void;
  onSidebarTabChange: (tab: AgentSidebarTab) => void;
  onImageSelect: (imageId: string) => void;
  onSettingsChange: (patch: Partial<AgentGenerationSettings>) => void;
  onInsertPrompt: (text: string) => void;
  onCancelQueue: (itemId: string) => void;
  onRetryQueue: (itemId: string) => void;
};

type Props = SidebarBodyProps & {
  overlay?: boolean;
  onClose?: () => void;
};

function SidebarBody({
  currentImage,
  images,
  contextTab,
  sidebarTab,
  queueItems,
  runSummary,
  settings,
  onContextTabChange,
  onSidebarTabChange,
  onImageSelect,
  onSettingsChange,
  onInsertPrompt,
  onCancelQueue,
  onRetryQueue,
}: SidebarBodyProps) {
  const { t } = useI18n();
  const panelProps = (tab: AgentSidebarTab) => ({
    id: `agent-sidebar-panel-${tab}`,
    role: "tabpanel" as const,
    "aria-labelledby": `agent-sidebar-tab-${tab}`,
  });

  return (
    <>
      <AgentSidebarTabs activeTab={sidebarTab} onChange={onSidebarTabChange} />
      {sidebarTab === "image" ? (
        <div {...panelProps("image")} className="agent-sidebar-panel"><AgentImagePane currentImage={currentImage} images={images} activeTab={contextTab} onTabChange={onContextTabChange} onImageSelect={onImageSelect} /></div>
      ) : null}
      {sidebarTab === "library" ? <div {...panelProps("library")} className="agent-sidebar-panel"><AgentPromptLibraryPanel mode="library" onInsert={onInsertPrompt} /></div> : null}
      {sidebarTab === "forms" ? <div {...panelProps("forms")} className="agent-sidebar-panel"><AgentFormTemplatePanel onInsert={onInsertPrompt} /></div> : null}
      {sidebarTab === "quality" ? (
        <section {...panelProps("quality")} className="agent-sidebar-panel agent-sidebar-section" aria-label={t("agent.quality")}>
          <header>
            <div>
              <span>{t("agent.quality")}</span>
              <strong>{settings.generationStrategy === "auto" ? t("agent.generationStrategyAuto") : t("agent.generationStrategyManual")}</strong>
            </div>
          </header>
          <AgentQualityPanel settings={settings} onChange={onSettingsChange} />
        </section>
      ) : null}
      {sidebarTab === "model" ? (
        <section {...panelProps("model")} className="agent-sidebar-panel agent-sidebar-section" aria-label={t("agent.modelSettings")}>
          <header>
            <div>
              <span>{t("agent.modelSettings")}</span>
              <strong>{settings.model}</strong>
            </div>
          </header>
          <AgentModelSelector settings={settings} onChange={onSettingsChange} />
        </section>
      ) : null}
      {sidebarTab === "queue" ? (
        <div {...panelProps("queue")} className="agent-sidebar-panel"><AgentQueuePanel items={queueItems} summary={runSummary} onCancel={onCancelQueue} onRetry={onRetryQueue} /></div>
      ) : null}
    </>
  );
}

const noop = () => {};

export function AgentRightSidebar({ overlay, onClose, ...rest }: Props) {
  const { t } = useI18n();
  const panelRef = useAgentDialogFocus(overlay === true, onClose ?? noop);
  if (overlay) {
    return (
      <div className="agent-dialog agent-dialog--tools" role="presentation">
        <button type="button" className="agent-dialog__backdrop" onClick={onClose} aria-label={t("agent.closeTools")} />
        <section ref={panelRef} className="agent-right-sidebar agent-right-sidebar--overlay" role="dialog" aria-modal="true" aria-label={t("agent.openTools")}>
          <header className="agent-right-sidebar__overlay-header">
            <strong>{t("agent.openTools")}</strong>
            <button type="button" onClick={onClose} aria-label={t("agent.closeTools")}><CloseIcon size={17} /></button>
          </header>
          <SidebarBody {...rest} />
        </section>
      </div>
    );
  }
  return (
    <aside className="agent-right-sidebar">
      <SidebarBody {...rest} />
    </aside>
  );
}
