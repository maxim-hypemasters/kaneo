import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";

type ShipDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ship: TaskAgent["ship"];
  runnerOnline: boolean;
  pending: boolean;
  onConfirm: () => void;
  /** Where focus goes on close; the Ship button may be gone by then. */
  finalFocus: () => HTMLElement | true;
};

// Built on the alert dialog parts rather than ConfirmDialog, which cannot
// say where focus goes when it closes.
export function ShipDialog({
  open,
  onOpenChange,
  ship,
  runnerOnline,
  pending,
  onConfirm,
  finalFocus,
}: ShipDialogProps) {
  const { t } = useTranslation();
  const rows = [
    { label: t("tasks:aiAgent.shipDialog.repository"), value: ship.repository },
    { label: t("tasks:aiAgent.shipDialog.baseBranch"), value: ship.baseBranch },
    { label: t("tasks:aiAgent.shipDialog.newBranch"), value: ship.branchName },
  ];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("tasks:aiAgent.shipDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("tasks:aiAgent.shipDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-6 pb-4">
          <dl className="grid gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex flex-wrap items-baseline justify-between gap-x-3"
              >
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 break-all font-mono text-xs">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {runnerOnline ? null : (
            <p className="mt-3 text-muted-foreground text-xs">
              {t("tasks:aiAgent.runnerOffline")}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending
              ? t("tasks:aiAgent.shipDialog.pending")
              : t("tasks:aiAgent.shipDialog.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
