import { useTranslation } from "react-i18next";
import { useAutoGrowTextarea } from "@/hooks/use-auto-grow-textarea";
import { cn } from "@/lib/cn";
import { stripLineBreaks } from "@/lib/strip-line-breaks";

const typography =
  "block w-full break-words font-heading font-semibold text-3xl text-foreground leading-[1.2] tracking-[-0.02em] sm:text-[2.25rem]";

// The project's name as a wrapping single-line field for editors, a heading
// for everyone else.
export function ProjectNameField({
  value,
  readOnly,
  error,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useAutoGrowTextarea(value, !readOnly);

  if (readOnly) return <h1 className={typography}>{value}</h1>;
  return (
    <div>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        aria-label={t("tasks:projectHome.overview.name")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "project-name-error" : undefined}
        placeholder={t("tasks:projectHome.overview.name")}
        className={cn(
          typography,
          "h-auto resize-none appearance-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-foreground/45",
        )}
        onChange={(event) => onChange(stripLineBreaks(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing)
            event.preventDefault();
        }}
      />
      {error && (
        <p id="project-name-error" className="mt-1 text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
