import { Loader2, Timer } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EstimateInput } from "@/components/task/estimate/estimate-input";
import { formatEstimate } from "@/components/task/estimate/effort";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ReleasePlanEstimateInput({
  value,
  editable,
  disabled,
  saving,
  error,
  onSave,
}: {
  value: number | null;
  editable: boolean;
  disabled?: boolean;
  saving: boolean;
  error: string | null;
  onSave: (seconds: number | null) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [valid, setValid] = useState(true);
  const [session, setSession] = useState(0);
  const blocked = disabled || saving;
  const label =
    value == null ? t("tasks:estimate.empty") : formatEstimate(value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {editable ? (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (saving || (next && disabled)) return;
            if (next && !error) {
              setDraft(value);
              setValid(true);
              setSession((current) => current + 1);
            }
            setOpen(next);
          }}
        >
          <PopoverTrigger
            disabled={blocked}
            aria-label={`${t("tasks:estimate.label")}: ${label}`}
            render={<Button type="button" variant="outline" size="xs" />}
          >
            <Timer aria-hidden="true" />
            {label}
          </PopoverTrigger>
          <PopoverContent
            className="w-72 max-w-[calc(100vw-2rem)]"
            align="start"
          >
            <div className="flex flex-col gap-3 p-3">
              <PopoverTitle className="text-sm">
                {t("tasks:estimate.label")}
              </PopoverTitle>
              <EstimateInput
                key={session}
                value={draft}
                onChange={setDraft}
                onValidityChange={setValid}
                disabled={blocked}
                inputClassName="w-full"
              />
              {error && (
                <p role="alert" className="text-xs text-destructive-foreground">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={blocked}
                  onClick={() => {
                    setDraft(null);
                    setValid(true);
                    setSession((current) => current + 1);
                  }}
                >
                  {t("tasks:estimate.clear")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  disabled={blocked || !valid}
                  onClick={async () => {
                    if (await onSave(draft)) setOpen(false);
                  }}
                >
                  {saving && (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  )}
                  {t("tasks:estimate.save")}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <span className="inline-flex min-h-7 items-center gap-1.5 text-xs text-muted-foreground sm:min-h-6">
          <Timer aria-hidden="true" className="size-3.5" />
          {label}
        </span>
      )}
      {error && (!open || !editable) && (
        <p role="alert" className="text-xs text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
