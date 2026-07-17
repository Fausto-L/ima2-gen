// Dynamic duration slider: snaps to the exact values a model's contract
// allows (options list or integer min..max range), so every video model gets
// one consistent control instead of a wall of preset buttons. Native
// <input type="range"> keeps mobile drag + keyboard/screen-reader semantics.
import { useId } from "react";
import { useI18n } from "../../i18n";

type Props = {
  /** Sorted allowed values (seconds). Non-uniform gaps snap by index. */
  values: ReadonlyArray<number>;
  /** Current value; null means Auto (parameter omitted). */
  value: number | null;
  /** Contract default shown while in Auto. */
  defaultValue?: number;
  onChange: (value: number | null) => void;
  /** Renders an Auto chip that clears the value (non-required parameters). */
  allowAuto?: boolean;
  disabled?: boolean;
  ariaLabel: string;
};

export function DurationSlider({ values, value, defaultValue, onChange, allowAuto = false, disabled, ariaLabel }: Props) {
  const { t } = useI18n();
  const inputId = useId();
  if (values.length === 0) return null;
  const effective = value ?? defaultValue ?? values[0];
  const nearestIndex = values.reduce(
    (best, candidate, index) =>
      Math.abs(candidate - effective) < Math.abs(values[best] - effective) ? index : best,
    0,
  );
  const isAuto = value === null;
  const min = values[0];
  const max = values[values.length - 1];

  return (
    <div className={`ctl-duration${isAuto ? " is-auto" : ""}${disabled ? " is-disabled" : ""}`}>
      <div className="ctl-duration__head">
        <output htmlFor={inputId} className="ctl-duration__value">
          {isAuto ? `${t("size.autoLabel")} · ${values[nearestIndex]}s` : `${values[nearestIndex]}s`}
        </output>
        {allowAuto ? (
          <button
            type="button"
            className={`option-btn ctl-duration__auto${isAuto ? " active" : ""}`}
            aria-pressed={isAuto}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            {t("size.autoLabel")}
          </button>
        ) : null}
      </div>
      <input
        id={inputId}
        type="range"
        className="ctl-duration__range"
        min={0}
        max={values.length - 1}
        step={1}
        value={nearestIndex}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuetext={`${values[nearestIndex]}s`}
        onChange={(event) => onChange(values[Number(event.target.value)] ?? values[0])}
      />
      <div className="ctl-duration__scale" aria-hidden="true">
        <span>{min}s</span>
        <span>{max}s</span>
      </div>
    </div>
  );
}
