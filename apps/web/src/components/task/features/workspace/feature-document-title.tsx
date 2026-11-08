import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAutoGrowTextarea } from "@/hooks/use-auto-grow-textarea";
import { cn } from "@/lib/cn";
import { stripLineBreaks } from "@/lib/strip-line-breaks";

const typography =
  "block w-full break-words font-heading font-semibold text-3xl text-foreground leading-[1.2] tracking-[-0.02em] sm:text-[2.25rem]";

// The page's title: a wrapping single-line field for editors, a heading for
// everyone else.
export function FeatureDocumentTitle({
  value,
  readOnly = false,
  focus = false,
  onChange,
  onCommit,
  onEnterBody,
}: {
  value: string;
  readOnly?: boolean;
  // Focuses and selects the title, as for a document just created.
  focus?: boolean;
  onChange?: (value: string) => void;
  onCommit?: () => void;
  // Moves the caret into the body, like Enter at the end of a line would.
  onEnterBody?: () => void;
}) {
  const { t } = useTranslation();
  const ref = useAutoGrowTextarea(value, !readOnly);

  useEffect(() => {
    if (!focus) return;
    ref.current?.focus();
    ref.current?.select();
  }, [focus, ref]);

  if (readOnly) return <h1 className={typography}>{value}</h1>;
  return (
    <textarea
      ref={ref}
      rows={1}
      maxLength={255}
      value={value}
      aria-label={t("tasks:features.workspace.documentTitle")}
      placeholder={t("tasks:features.workspace.documentTitle")}
      className={cn(
        typography,
        "h-auto resize-none appearance-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-foreground/45",
      )}
      onChange={(event) => onChange?.(stripLineBreaks(event.target.value))}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        const {
          selectionStart,
          selectionEnd,
          value: text,
        } = event.currentTarget;
        const atEnd =
          selectionStart === text.length && selectionEnd === text.length;
        const plain =
          !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
        if (
          event.key === "Enter" ||
          (event.key === "ArrowDown" && atEnd && plain)
        ) {
          event.preventDefault();
          onEnterBody?.();
        }
      }}
    />
  );
}
