import { SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

const SUGGESTION_KEYS = [
  "workspace:assistant.empty.suggestions.dueThisWeek",
  "workspace:assistant.empty.suggestions.openBugs",
  "workspace:assistant.empty.suggestions.recentChanges",
] as const;

type EmptyChatProps = {
  model: string | null;
  /** Puts a suggestion in the composer; it is not sent. */
  onSuggestion: (text: string) => void;
};

export function EmptyChat({ model, onSuggestion }: EmptyChatProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <div className="flex flex-col items-center gap-1.5">
        <SparklesIcon
          aria-hidden="true"
          className="mb-1 size-5 text-muted-foreground/70"
        />
        <h3 className="font-semibold text-base text-foreground">
          {t("workspace:assistant.empty.title")}
        </h3>
        <p className="max-w-sm text-muted-foreground text-sm">
          {t("workspace:assistant.empty.description")}
        </p>
      </div>
      <ul
        aria-label={t("workspace:assistant.empty.suggestionsLabel")}
        className="flex max-w-lg flex-wrap justify-center gap-2"
      >
        {SUGGESTION_KEYS.map((key) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSuggestion(t(key))}
              className="cursor-pointer rounded-full border border-border bg-background px-3 py-1.5 text-[13px] text-foreground outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t(key)}
            </button>
          </li>
        ))}
      </ul>
      {model ? (
        <p className="max-w-md text-muted-foreground/80 text-xs">
          {t("workspace:assistant.empty.disclosure", { model })}
        </p>
      ) : null}
    </div>
  );
}
