import { ArrowDownIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStickToBottom } from "./use-stick-to-bottom";

type ConversationScrollerProps = {
  children: ReactNode;
  /** Changes when the user sends, which brings the latest back into view. */
  pinKey: number;
};

export function ConversationScroller({
  children,
  pinKey,
}: ConversationScrollerProps) {
  const { t } = useTranslation();
  const { viewportRef, contentRef, atBottom, scrollToBottom } =
    useStickToBottom();
  // The scroll area keeps its viewport to itself; find it under the root.
  const setRoot = useCallback(
    (root: HTMLDivElement | null) => {
      viewportRef.current =
        root?.querySelector<HTMLElement>(
          '[data-slot="scroll-area-viewport"]',
        ) ?? null;
    },
    [viewportRef],
  );

  const pinnedKey = useRef(pinKey);
  useEffect(() => {
    if (pinnedKey.current === pinKey) return;
    pinnedKey.current = pinKey;
    scrollToBottom();
  }, [pinKey, scrollToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ScrollArea ref={setRoot} className="min-h-0 flex-1" scrollFade>
        <div ref={contentRef} className="flex flex-col gap-4 px-4 py-4">
          {children}
        </div>
      </ScrollArea>
      {atBottom ? null : (
        <Button
          size="xs"
          variant="outline"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md/5"
        >
          <ArrowDownIcon aria-hidden="true" />
          {t("workspace:assistant.conversation.jumpToLatest")}
        </Button>
      )}
    </div>
  );
}
