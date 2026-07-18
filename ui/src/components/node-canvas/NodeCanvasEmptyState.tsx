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
  return (
    <section className="node-empty-state" aria-labelledby="node-empty-state-title">
      <div className="node-empty-state__intro">
        <p className="node-empty-state__eyebrow">Node studio</p>
        <h2 id="node-empty-state-title">Build an image workflow</h2>
        <p>Start with a prompt, reuse a proven graph, or continue your latest work.</p>
      </div>
      <div className="node-empty-state__choices">
        <EmptyStateChoice
          title="Start with a blank canvas"
          description="Add one prompt node and shape the workflow yourself."
          action="Start blank"
          onClick={onStartBlank}
        />
        <EmptyStateChoice
          title="Start from a template"
          description="Copy a ready-made graph for a common generation workflow."
          action="Browse templates"
          onClick={onOpenTemplates}
        />
        <EmptyStateChoice
          title="Resume recent graph"
          description={hasRecentGraph ? "Continue the most recently saved valid graph." : "No recent graph is available yet."}
          action="Resume recent"
          disabled={!hasRecentGraph}
          onClick={() => void onResumeRecent()}
        />
      </div>
    </section>
  );
}
