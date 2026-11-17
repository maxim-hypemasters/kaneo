import { ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { classifyMarkdownHref } from "./markdown-href";

type MarkdownImageLinkProps = {
  src: string | undefined;
  alt: string | undefined;
};

// Answers never load images (no tracking beacons): an image becomes a link
// to it, labelled with its alt text.
export function MarkdownImageLink({ src, alt }: MarkdownImageLinkProps) {
  const { t } = useTranslation();
  const label = alt?.trim() || t("workspace:assistant.links.image");
  const target = src ? classifyMarkdownHref(src) : null;

  const content = (
    <>
      <ImageIcon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
    </>
  );
  if (!target) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {content}
      </span>
    );
  }
  return (
    <a
      href={target.href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
    >
      {content}
      <span className="sr-only">
        {" "}
        {t("workspace:assistant.links.opensInNewTab")}
      </span>
    </a>
  );
}
