import { Timer } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { EstimateInput } from "./estimate-input";
import { formatEstimate } from "./effort";

export function TaskEstimate({ task }: { task: Task }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number | null>(
    task.estimateSeconds ?? null,
  );
  const [valid, setValid] = useState(true);
  const [editorSession, setEditorSession] = useState(0);
  const { canUpdateTasks } = useWorkspacePermission();
  const mutation = useUpdateTask();
  const label =
    task.estimateSeconds == null
      ? t("tasks:estimate.empty")
      : formatEstimate(task.estimateSeconds);
  if (!canUpdateTasks())
    return <span className="text-sm text-muted-foreground">{label}</span>;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (next) {
          setValue(task.estimateSeconds ?? null);
          setValid(true);
          setEditorSession((current) => current + 1);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <Timer aria-hidden="true" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-72 max-w-[calc(100vw-2rem)]" align="start">
        <div className="flex flex-col gap-3 p-3">
          <p className="text-sm font-medium">{t("tasks:estimate.label")}</p>
          <EstimateInput
            key={editorSession}
            value={value}
            onChange={setValue}
            disabled={mutation.isPending}
            onValidityChange={setValid}
            inputClassName="w-full"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => {
                setValue(null);
                setValid(true);
                setEditorSession((current) => current + 1);
              }}
            >
              {t("tasks:estimate.clear")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!valid || mutation.isPending}
              onClick={async () => {
                try {
                  await mutation.mutateAsync({
                    ...task,
                    estimateSeconds: value,
                  });
                  setOpen(false);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : t("tasks:estimate.updateError"),
                  );
                }
              }}
            >
              {t("tasks:estimate.save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
