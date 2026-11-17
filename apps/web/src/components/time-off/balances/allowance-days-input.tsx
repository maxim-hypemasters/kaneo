import { type Ref, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { resolveAllowanceDraft } from "./allowance-draft";

type AllowanceDaysInputProps = {
  id?: string;
  ref?: Ref<HTMLInputElement>;
  // The saved days; null leaves the field empty so the placeholder shows.
  value: number | null;
  placeholder?: string;
  // Emptying the field commits null.
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  // Called on blur or Enter with a changed, valid value. It handles its own
  // errors.
  onCommit: (days: number | null) => Promise<void>;
};

// A days field that saves when you leave it or press Enter. Escape puts the
// saved value back.
export function AllowanceDaysInput({
  id,
  ref,
  value,
  placeholder,
  allowEmpty = false,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  onCommit,
}: AllowanceDaysInputProps) {
  const { t } = useTranslation();
  const errorId = useId();
  // null until something is typed, so a refetched value shows right away.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const saving = useRef(false);

  const commit = async () => {
    if (saving.current) return;
    const result = resolveAllowanceDraft(draft, value, { allowEmpty });
    if (result.kind === "invalid") {
      setInvalid(true);
      return;
    }
    if (result.kind === "unchanged") {
      setDraft(null);
      return;
    }
    saving.current = true;
    try {
      await onCommit(result.days);
    } finally {
      saving.current = false;
      setDraft(null);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        size="sm"
        className={cn("w-24", className)}
        value={draft ?? (value === null ? "" : String(value))}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [describedBy, invalid ? errorId : null].filter(Boolean).join(" ") ||
          undefined
        }
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setInvalid(false);
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape" && draft !== null) {
            event.preventDefault();
            setDraft(null);
            setInvalid(false);
          }
        }}
      />
      {invalid ? (
        <p id={errorId} className="text-destructive-foreground text-xs">
          {t("team:timeOff.balances.invalid")}
        </p>
      ) : null}
    </div>
  );
}
