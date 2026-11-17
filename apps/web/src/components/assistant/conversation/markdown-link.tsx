import { useNavigate } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { classifyMarkdownHref } from "./markdown-href";

type MarkdownLinkProps = {
  href: string | undefined;
  workspaceSlug: string | undefined;
  children?: ReactNode;
};

const LINK_CLASS =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground";

const isPlainClick = (event: MouseEvent) =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

// A link in an answer. Kaneo pages open in place through the router, other
// sites in a new tab without a referrer, and unsafe links as plain text.
export function MarkdownLink({
  href,
  workspaceSlug,
  children,
}: MarkdownLinkProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const target = href ? classifyMarkdownHref(href, workspaceSlug) : null;

  if (!target) return <span>{children}</span>;

  if (target.kind === "external") {
    const opensTab = !/^mailto:/i.test(target.href);
    return (
      <a
        href={target.href}
        target={opensTab ? "_blank" : undefined}
        rel="noopener noreferrer nofollow"
        className={LINK_CLASS}
      >
        {children}
        {opensTab ? (
          <span className="sr-only">
            {" "}
            {t("workspace:assistant.links.opensInNewTab")}
          </span>
        ) : null}
      </a>
    );
  }

  return (
    <a
      href={target.href}
      className={LINK_CLASS}
      onClick={
        target.kind === "app"
          ? (event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              void navigate({ href: target.href });
            }
          : undefined
      }
    >
      {children}
    </a>
  );
}
