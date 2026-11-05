import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { estimateToSeconds, formatEstimate } from "./effort";

export function EstimateInput({
  value,
  onChange,
  disabled,
  onValidityChange,
  inputClassName,
}: {
  value: number | null | undefined;
  onChange: (seconds: number | null) => void;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
  inputClassName?: string;
}) {
  const { t } = useTranslation();
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const emitted = useRef<{ value: number | null } | null>(null);
  const [text, setText] = useState(() => formatEstimate(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    // Echoing an edit must not replace the user's shorthand while they type.
    if (emitted.current?.value === (value ?? null)) {
      emitted.current = null;
      return;
    }
    setText(formatEstimate(value));
    inputRef.current?.setCustomValidity("");
    setInvalid(false);
    onValidityChange?.(true);
  }, [value, onValidityChange]);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Input
        ref={inputRef}
        type="text"
        maxLength={100}
        autoComplete="off"
        spellCheck={false}
        className={cn("min-w-0 w-40", inputClassName)}
        aria-label={t("tasks:estimate.label")}
        aria-describedby={helpId}
        placeholder={t("tasks:estimate.shorthandPlaceholder")}
        title={t("tasks:estimate.shorthandHelp")}
        disabled={disabled}
        value={text}
        aria-invalid={invalid}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const seconds = estimateToSeconds(next);
          event.currentTarget.setCustomValidity(
            seconds === undefined ? t("tasks:estimate.invalid") : "",
          );
          setInvalid(seconds === undefined);
          onValidityChange?.(seconds !== undefined);
          if (seconds !== undefined) {
            emitted.current = { value: seconds };
            onChange(seconds);
          }
        }}
        onBlur={() => {
          const seconds = estimateToSeconds(text);
          if (seconds !== undefined) setText(formatEstimate(seconds));
        }}
      />
      <p
        id={helpId}
        className={invalid ? "text-xs text-destructive-foreground" : "sr-only"}
        role={invalid ? "alert" : undefined}
      >
        {invalid
          ? t("tasks:estimate.invalid")
          : t("tasks:estimate.shorthandHelp")}
      </p>
    </div>
  );
}
