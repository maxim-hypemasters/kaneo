import { useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { safeMarkdownUrl } from "./markdown-href";
import { MarkdownImageLink } from "./markdown-image-link";
import { MarkdownLink } from "./markdown-link";

const REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_CLASS = cn(
  "min-w-0 break-words text-sm text-foreground leading-relaxed",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2 [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:font-semibold [&_h1]:text-base [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-semibold [&_h2]:text-base [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-medium",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_li]:my-0.5 [&_li>ul]:my-0.5 [&_li>ol]:my-0.5",
  "[&_blockquote]:my-2 [&_blockquote]:border-border [&_blockquote]:border-s-2 [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[13px] [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_th]:font-medium",
  "[&_hr]:my-3 [&_hr]:border-border",
);

type AssistantMarkdownProps = {
  content: string;
  workspaceSlug: string | undefined;
  className?: string;
};

/**
 * An answer as Markdown (with GitHub tables, lists and strikethrough). Raw
 * HTML is dropped, images become links, and only safe link schemes survive.
 */
export function AssistantMarkdown({
  content,
  workspaceSlug,
  className,
}: AssistantMarkdownProps) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => (
        <MarkdownLink href={href} workspaceSlug={workspaceSlug}>
          {children}
        </MarkdownLink>
      ),
      img: ({ src, alt }) => (
        <MarkdownImageLink
          src={typeof src === "string" ? src : undefined}
          alt={alt}
        />
      ),
    }),
    [workspaceSlug],
  );

  return (
    <div className={cn(MARKDOWN_CLASS, className)}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        skipHtml
        urlTransform={safeMarkdownUrl}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
}
