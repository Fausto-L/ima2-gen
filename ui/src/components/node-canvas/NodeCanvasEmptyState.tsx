import { useI18n } from "../../i18n";

export interface NodeCanvasEmptyStateProps {
  hasRecentGraph: boolean;
  onStartBlank(): void;
  onOpenTemplates(): void;
  onResumeRecent(): Promise<void>;
}

type ChoiceProps = {
  title: string;
  description: string;
  action: string;
  disabled?: boolean;
  onClick(): void;
};

function EmptyStateChoice({ title, description, action, disabled, onClick }: ChoiceProps) {
  return (
    <button
      type="button"
      className="node-empty-state__choice"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="node-empty-state__choice-title">{title}</span>
      <span className="node-empty-state__choice-description">{description}</span>
      <span className="node-empty-state__choice-action">{action}</span>
    </button>
  );
}

/** The first canvas decision; DOM order intentionally matches visual and tab order. */
export function NodeCanvasEmptyState({
  hasRecentGraph,
  onStartBlank,
  onOpenTemplates,
  onResumeRecent,
}: NodeCanvasEmptyStateProps) {
  const { t } = useI18n();
  return (
    <section className="node-empty-state" aria-labelledby="node-empty-state-title">
      <div className="node-empty-state__intro">
        <p className="node-empty-state__eyebrow">{t("nodeStudio.name")}</p>
        <h2 id="node-empty-state-title">{t("nodeStudio.empty.title")}</h2>
        <p>{t("nodeStudio.empty.description")}</p>
      </div>
      <div className="node-empty-state__choices">
        <EmptyStateChoice
          title={t("nodeStudio.empty.blankTitle")}
          description={t("nodeStudio.empty.blankDescription")}
          action={t("nodeStudio.empty.blankAction")}
          onClick={onStartBlank}
        />
        <EmptyStateChoice
          title={t("nodeStudio.empty.templateTitle")}
          description={t("nodeStudio.empty.templateDescription")}
          action={t("nodeStudio.empty.templateAction")}
          onClick={onOpenTemplates}
        />
        <EmptyStateChoice
          title={t("nodeStudio.empty.recentTitle")}
          description={t(hasRecentGraph ? "nodeStudio.empty.recentDescription" : "nodeStudio.empty.recentUnavailable")}
          action={t("nodeStudio.empty.recentAction")}
          disabled={!hasRecentGraph}
          onClick={() => void onResumeRecent()}
        />
      </div>
    </section>
  );
}
