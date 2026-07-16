import { useI18n } from "../../i18n";
import type { McpModelEntry, McpModelParameter, McpPresetValue } from "../../lib/mcpProviders";
import { DurationSlider } from "../controls/DurationSlider";

const CORE_PARAMETERS = new Set(["duration", "resolution", "quality", "mode"]);

type Props = {
  entry: McpModelEntry;
  ratio: string | null;
  parameters: Record<string, McpPresetValue>;
  disabled?: boolean;
  onRatio: (value: string | null) => void;
  onParameter: (name: string, value: McpPresetValue | null) => void;
};

function uniqueValues(values: McpPresetValue[]): McpPresetValue[] {
  return values.filter((value, index) => values.findIndex((candidate) => candidate === value) === index);
}

export function parameterPresetValues(parameter: McpModelParameter): McpPresetValue[] {
  if (parameter.options && parameter.options.length > 0) return uniqueValues(parameter.options);
  if (parameter.type === "boolean") return [true, false];
  if (parameter.type !== "number" || parameter.min === undefined || parameter.max === undefined) return [];
  if (Number.isInteger(parameter.min) && Number.isInteger(parameter.max) && parameter.max - parameter.min <= 20) {
    return Array.from({ length: parameter.max - parameter.min + 1 }, (_, index) => parameter.min! + index);
  }
  return uniqueValues([parameter.min, ...(parameter.default !== undefined ? [parameter.default] : []), parameter.max]);
}

function parameterLabel(name: string, t: (key: string) => string): string {
  const known: Record<string, string> = {
    duration: t("mcp.durationLabel"),
    resolution: t("mcp.resolutionLabel"),
    quality: t("mcp.qualityLabel"),
    mode: t("mcp.modeLabel"),
    generateAudio: t("mcp.audioLabel"),
    generate_audio: t("mcp.audioLabel"),
    sound: t("mcp.audioLabel"),
  };
  return known[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: McpPresetValue, t: (key: string) => string): string {
  if (typeof value === "boolean") return value ? t("mcp.onLabel") : t("mcp.offLabel");
  return String(value);
}

function durationValues(parameter: McpModelParameter): number[] {
  const raw = parameterPresetValues(parameter).filter((value): value is number => typeof value === "number");
  return [...raw].sort((a, b) => a - b);
}

function PresetRow({ parameter, value, disabled, onChange }: {
  parameter: McpModelParameter;
  value: McpPresetValue | undefined;
  disabled?: boolean;
  onChange: (value: McpPresetValue | null) => void;
}) {
  const { t } = useI18n();
  // Duration renders as one dynamic slider snapped to the model contract
  // (options list or min..max range) instead of a button wall.
  if (parameter.name === "duration" && parameter.type === "number") {
    const values = durationValues(parameter);
    if (values.length > 1) {
      const label = parameterLabel(parameter.name, t);
      return (
        <div className="mcp-preset-row">
          <div className="section-title">{label}</div>
          <DurationSlider
            values={values}
            value={typeof value === "number" ? value : null}
            defaultValue={typeof parameter.default === "number" ? parameter.default : undefined}
            allowAuto={!parameter.required}
            disabled={disabled}
            ariaLabel={label}
            onChange={onChange}
          />
        </div>
      );
    }
  }
  const values = parameterPresetValues(parameter);
  if (values.length === 0) return null;
  const label = parameterLabel(parameter.name, t);
  return (
    <div className="mcp-preset-row">
      <div className="section-title">{label}</div>
      <div className="mcp-preset-row__options" role="group" aria-label={label}>
        {!parameter.required ? (
          <button type="button" className={`option-btn${value === undefined ? " active" : ""}`} disabled={disabled} onClick={() => onChange(null)}>
            {t("size.autoLabel")}
          </button>
        ) : null}
        {values.map((option) => (
          <button
            key={`${typeof option}:${String(option)}`}
            type="button"
            className={`option-btn${value === option ? " active" : ""}`}
            disabled={disabled}
            onClick={() => onChange(option)}
            title={parameter.description}
          >
            {displayValue(option, t)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ParameterRows({ entries, parameters, disabled, onParameter }: {
  entries: McpModelParameter[];
  parameters: Record<string, McpPresetValue>;
  disabled?: boolean;
  onParameter: Props["onParameter"];
}) {
  return <>{entries.map((parameter) => (
    <PresetRow
      key={parameter.name}
      parameter={parameter}
      value={parameters[parameter.name]}
      disabled={disabled}
      onChange={(value) => onParameter(parameter.name, value)}
    />
  ))}</>;
}

export function McpModelPresetControls({ entry, ratio, parameters, disabled, onRatio, onParameter }: Props) {
  const { t } = useI18n();
  const ratios = entry.capabilities.aspectRatios.filter((value) => value !== "auto");
  const renderable = entry.capabilities.parameters.filter((parameter) => parameterPresetValues(parameter).length > 0);
  const core = renderable.filter((parameter) => CORE_PARAMETERS.has(parameter.name));
  const advanced = renderable.filter((parameter) => !CORE_PARAMETERS.has(parameter.name));
  return (
    <div className="mcp-model-presets" data-capability-source={entry.capabilities.source}>
      {ratios.length > 0 ? (
        <div className="mcp-preset-row">
          <div className="section-title">{t("mcp.aspectRatioLabel")}</div>
          <div className="mcp-preset-row__options" role="group" aria-label={t("mcp.aspectRatioLabel")}>
            <button type="button" className={`option-btn${ratio === null ? " active" : ""}`} disabled={disabled} onClick={() => onRatio(null)}>{t("size.autoLabel")}</button>
            {ratios.map((value) => <button key={value} type="button" className={`option-btn${ratio === value ? " active" : ""}`} disabled={disabled} onClick={() => onRatio(value)}>{value}</button>)}
          </div>
        </div>
      ) : null}
      <ParameterRows entries={core} parameters={parameters} disabled={disabled} onParameter={onParameter} />
      {entry.capabilities.inputRoles.length > 0 ? (
        <div className="mcp-tool-inputs">
          <div className="section-title">{t("mcp.toolInputsLabel")}</div>
          <div className="mcp-tool-inputs__tags">{entry.capabilities.inputRoles.map((role) => <span key={role}>{role.replace(/_/g, " ")}</span>)}</div>
        </div>
      ) : null}
      {advanced.length > 0 ? (
        <details className="mcp-advanced-presets">
          <summary>{t("mcp.advancedPresetsLabel")}</summary>
          <ParameterRows entries={advanced} parameters={parameters} disabled={disabled} onParameter={onParameter} />
        </details>
      ) : null}
      {ratios.length === 0 && renderable.length === 0 ? <p className="option-help">{t("mcp.providerDefaultsHelp")}</p> : null}
    </div>
  );
}
