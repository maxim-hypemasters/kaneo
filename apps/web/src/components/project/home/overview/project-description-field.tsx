import { useTranslation } from "react-i18next";
import { useAutoGrowTextarea } from "@/hooks/use-auto-grow-textarea";
import { cn } from "@/lib/cn";

const typography =
  "block w-full whitespace-pre-wrap break-words text-base text-foreground/90 leading-relaxed";

// The description is plain text. Editors get a growing textarea; everyone
// else reads it, or a note that there is none.
export function ProjectDescriptionField({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useAutoGrowTextarea(value, !readOnly);

  if (readOnly)
    return value.trim() ? (
      <p className={typography}>{value}</p>
    ) : (
      <p className="text-muted-foreground text-sm">
        {t("tasks:projectHome.overview.noDescription")}
      </p>
    );
  return (
    <textarea
      ref={ref}
      rows={3}
      value={value}
      aria-label={t("tasks:projectHome.overview.description")}
      placeholder={t("tasks:projectHome.overview.descriptionPlaceholder")}
      className={cn(
        typography,
        "min-h-24 resize-none appearance-none overflow-hidden rounded-md border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground",
      )}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
