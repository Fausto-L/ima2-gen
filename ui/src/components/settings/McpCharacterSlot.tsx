// wp4 045: character binding slot for MCP generation — offered only when the
// selected model declares image_references, disabled while @element mentions
// are attached (server 409 CHARACTER_ELEMENT_CONFLICT mirrored client-side).
import { characterSlotEligible, resolveCharacterConflict } from "../../lib/characterBinding";
import { useAppStore } from "../../store/useAppStore";
import { useI18n } from "../../i18n";

type Props = { inputRoles: readonly string[]; disabled?: boolean };

export function McpCharacterSlot({ inputRoles, disabled }: Props) {
  const { t } = useI18n();
  const assets = useAppStore((s) => s.assets);
  const characterElementId = useAppStore((s) => s.mcpCharacterElementId ?? null);
  const mentionIds = useAppStore((s) => (s as unknown as { selectedElementIds?: string[] }).selectedElementIds ?? []);
  if (!characterSlotEligible(inputRoles)) return null;

  const characters = assets.filter((asset) => asset.kind === "element"
    && (asset.metadata as { elementKind?: unknown } | null)?.elementKind === "character");
  const conflict = resolveCharacterConflict({ mentionElementIds: mentionIds, characterElementId }) === "conflict";
  const slotDisabled = Boolean(disabled) || mentionIds.length > 0;

  return (
    <div className="mcp-character-slot" data-testid="mcp-character-slot">
      <div className="section-title">{t("mcp.characterSlotLabel")}</div>
      <select
        value={characterElementId ?? ""}
        disabled={slotDisabled}
        aria-label={t("mcp.characterSlotLabel")}
        title={mentionIds.length > 0 ? t("mcp.characterSlotConflictHint") : undefined}
        onChange={(event) => useAppStore.setState({ mcpCharacterElementId: event.target.value || null })}
      >
        <option value="">{t("mcp.characterSlotNone")}</option>
        {characters.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
      </select>
      {conflict ? <p className="option-help" role="alert">{t("mcp.characterSlotConflictHint")}</p> : null}
    </div>
  );
}
