import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

type FavoriteStarButtonProps = {
  active: boolean;
  label: string;
  variant: "gallery" | "result" | "asset";
  busy?: boolean;
  onToggle: () => void | Promise<void>;
};

export function FavoriteStarButton({
  active,
  label,
  variant,
  busy = false,
  onToggle,
}: FavoriteStarButtonProps) {
  const stopPointer = (event: PointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
  };
  const stopMouse = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
  };
  const stopKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  };

  return (
    <button
      type="button"
      className={`favorite-star favorite-star--${variant}${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      aria-busy={busy || undefined}
      disabled={busy}
      onPointerDown={stopPointer}
      onDoubleClick={stopMouse}
      onKeyDown={stopKey}
      onClick={(event) => {
        event.stopPropagation();
        void onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m12 2.75 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 16.94 6.44 19.87l1.06-6.2L3 9.28l6.22-.9L12 2.75Z" />
      </svg>
    </button>
  );
}
