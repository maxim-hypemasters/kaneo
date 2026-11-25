import { MessageSquare } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// Opens and closes the comments panel, and says how many threads are open.
export function DocumentCommentsButton({
  ref,
  open,
  count,
  controls,
  onToggle,
}: {
  ref?: Ref<HTMLButtonElement>;
  open: boolean;
  count: number;
  // The id of the panel this button shows and hides.
  controls: string;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      ref={ref}
      type="button"
      size="sm"
      variant="ghost"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={t("common:documentComments.toggle", { count })}
      className={open ? "bg-accent" : undefined}
      onClick={onToggle}
    >
      <MessageSquare />
      {count > 0 && <span aria-hidden="true">{count}</span>}
    </Button>
  );
}
