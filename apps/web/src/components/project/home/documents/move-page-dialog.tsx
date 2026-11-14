import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import {
  descendantIds,
  flattenPageTree,
  type TreePage,
} from "./tree/page-tree";

const TOP_LEVEL = "__top__";

// The keyboard-friendly way to nest a page: pick its new parent from the
// whole tree. The page itself and its sub-pages are not offered.
export function MovePageDialog({
  page,
  pages,
  pending,
  failed,
  onOpenChange,
  onMove,
}: {
  page: TreePage | null;
  pages: readonly TreePage[];
  pending: boolean;
  failed: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (parentId: string | null) => void;
}) {
  const { t } = useTranslation();
  const current = page?.parentId ?? TOP_LEVEL;
  // Keyed by the page, so each opening starts from its current parent.
  const [target, setTarget] = useState<string>(current);
  const options = useMemo(() => {
    if (!page) return [];
    const hidden = descendantIds(pages, page.id);
    hidden.add(page.id);
    const all = new Set(pages.map((candidate) => candidate.id));
    return flattenPageTree(pages, all).filter(
      (row) => !hidden.has(row.page.id),
    );
  }, [page, pages]);
  const title = page?.title || t("tasks:projectHome.documents.untitled");

  return (
    <Dialog
      open={page !== null}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            {t("tasks:projectHome.documents.moveDialogTitle", { title })}
          </DialogTitle>
          <DialogDescription>
            {t("tasks:projectHome.documents.moveDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="max-h-80">
          <RadioGroup
            value={target}
            onValueChange={(value) => setTarget(String(value))}
            aria-label={t("tasks:projectHome.documents.moveDestination")}
            className="gap-1"
          >
            <Label className="h-8 gap-2 rounded-md px-2 hover:bg-accent/50">
              <Radio value={TOP_LEVEL} />
              {t("tasks:projectHome.documents.topLevel")}
            </Label>
            {options.map((row) => (
              <Label
                key={row.page.id}
                className="h-8 min-w-0 gap-2 rounded-md px-2 hover:bg-accent/50"
                style={{ paddingLeft: 8 + (row.depth + 1) * 16 }}
              >
                <Radio value={row.page.id} />
                <span className="truncate">
                  {row.page.title || t("tasks:projectHome.documents.untitled")}
                </span>
              </Label>
            ))}
          </RadioGroup>
        </DialogPanel>
        {failed && (
          <p role="alert" className="px-6 text-destructive text-sm">
            {t("tasks:projectHome.documents.moveFailed")}
          </p>
        )}
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" size="sm" />}
            disabled={pending}
          >
            {t("common:actions.cancel")}
          </DialogClose>
          <Button
            type="button"
            size="sm"
            loading={pending}
            disabled={pending || target === current}
            onClick={() => onMove(target === TOP_LEVEL ? null : target)}
          >
            {t("tasks:projectHome.documents.move")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
