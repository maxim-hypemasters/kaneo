import { useTranslation } from "react-i18next";

// Shown until the first words of an answer arrive. The dots stay still for
// people who prefer reduced motion.
export function ThinkingIndicator() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center gap-2 text-muted-foreground text-sm">
      <span aria-hidden="true" className="flex gap-0.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      {t("workspace:assistant.conversation.thinking")}
    </p>
  );
}
