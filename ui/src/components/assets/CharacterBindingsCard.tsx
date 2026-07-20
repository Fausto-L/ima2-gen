// wp4 045: provider binding card for character elements — Runway tag edit,
// Higgsfield locked train surface, drift/cap warnings. Chrome grammar: reuses
// element-detail section styles (no new colors).
import { useState } from "react";
import { bindingDrift, bindingRefsCapExceeded, type CharacterProviderBinding } from "../../lib/characterBinding";
import { useI18n } from "../../i18n";

type Props = {
  bindings: CharacterProviderBinding[];
  refs: string[];
  onSave: (bindings: CharacterProviderBinding[]) => Promise<boolean>;
};

const TAG_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function CharacterBindingsCard({ bindings, refs, onSave }: Props) {
  const { t } = useI18n();
  const runway = bindings.find((binding) => binding.provider === "runway");
  const higgsfield = bindings.find((binding) => binding.provider === "higgsfield");
  const [tag, setTag] = useState(runway?.tag ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveRunway = async () => {
    const trimmed = tag.trim();
    if (trimmed && !TAG_PATTERN.test(trimmed)) {
      setError(t("assets.bindingTagInvalid"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next: CharacterProviderBinding[] = [
        { provider: "runway", mode: "stateless-refs", ...(trimmed ? { tag: trimmed } : {}) },
        ...(higgsfield ? [higgsfield] : []),
      ];
      if (!await onSave(next)) setError(t("assets.actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="element-detail__section" data-testid="character-bindings-card">
      <div className="element-detail__section-heading">
        <div><h3>{t("assets.bindingsTitle")}</h3><p>{t("assets.bindingsHelp")}</p></div>
      </div>
      <div className="character-binding-row">
        <span className="character-binding-row__provider">Runway</span>
        <span className="character-binding-row__mode">{t("assets.bindingStateless")}</span>
        <input
          value={tag}
          maxLength={32}
          placeholder={t("assets.bindingTagPlaceholder")}
          aria-label={t("assets.bindingTagPlaceholder")}
          onChange={(event) => setTag(event.target.value)}
        />
        <button type="button" disabled={saving} onClick={() => void saveRunway()}>
          {saving ? t("assets.bindingSaving") : t("assets.bindingSave")}
        </button>
      </div>
      {bindingRefsCapExceeded(refs) ? (
        <p className="element-detail__error" role="alert">{t("assets.bindingCapWarning", { count: refs.length })}</p>
      ) : null}
      <div className="character-binding-row character-binding-row--locked">
        <span className="character-binding-row__provider">Higgsfield</span>
        {higgsfield?.status ? (
          <span className="character-binding-row__status">{higgsfield.status}</span>
        ) : null}
        <button type="button" disabled title={t("assets.bindingTrainLockedHint")}>
          {t("assets.bindingTrain")}
        </button>
        <span className="character-binding-row__badge">{t("assets.bindingPaidPlan")}</span>
      </div>
      {higgsfield && bindingDrift(refs, higgsfield) ? (
        <p className="element-detail__error" role="alert">{t("assets.bindingDriftWarning")}</p>
      ) : null}
      {error ? <p className="element-detail__error" role="alert">{error}</p> : null}
    </section>
  );
}
