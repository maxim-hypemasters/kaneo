import { useTranslation } from "react-i18next";

export function UserMessage({ content }: { content: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-foreground text-sm">
        <span className="sr-only">
          {t("workspace:assistant.conversation.you")}:{" "}
        </span>
        {content}
      </p>
    </div>
  );
}
