import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type AssistantExternalLinkProps = {
  href: string;
  children: ReactNode;
};

export function AssistantExternalLink({
  href,
  children,
}: AssistantExternalLinkProps) {
  const { t } = useTranslation();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLinkIcon aria-hidden="true" className="size-3" />
      <span className="sr-only">
        {t("settings:assistantPage.opensInNewTab")}
      </span>
    </a>
  );
}
