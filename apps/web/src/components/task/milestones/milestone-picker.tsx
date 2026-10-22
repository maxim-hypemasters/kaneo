import { Check, Diamond } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { useGetMilestones } from "@/hooks/queries/milestone/use-get-milestones";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { cn } from "@/lib/cn";
import { HttpError } from "@/lib/http-error";
import { releaseSummaries } from "@/lib/releases/release-summaries";

export function MilestonePicker({
  projectId,
  featureId,
  value,
  onChange,
  disabled,
  className,
}: {
  projectId: string;
  featureId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const {
    data = [],
    isPending,
    isError,
    refetch,
  } = useGetMilestones(projectId, featureId);
  const releaseQuery = useGetReleases(projectId, {
    enabled: open && data.some((milestone) => milestone.releaseId),
    select: releaseSummaries,
  });
  const releaseAccessDenied =
    releaseQuery.error instanceof HttpError &&
    (releaseQuery.error.status === 401 || releaseQuery.error.status === 403);
  const releases = releaseAccessDenied ? [] : (releaseQuery.data ?? []);
  const selected = data.find((m) => m.id === value);
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        render={
          <button
            aria-label={`${t("tasks:milestones.property")}: ${selected?.title ?? t(value ? "tasks:milestones.unavailable" : "tasks:milestones.none")}`}
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-accent/50",
              className,
            )}
          />
        }
      >
        <Diamond
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <span className="sr-only">{t("tasks:milestones.property")}: </span>
        <span className="max-w-48 truncate">
          {selected?.title ??
            t(value ? "tasks:milestones.unavailable" : "tasks:milestones.none")}
        </span>
      </MenuTrigger>
      <MenuPopup align="start" className="max-h-80 w-64 overflow-auto">
        <MenuItem onClick={() => onChange(null)}>
          <span className="flex w-full items-center gap-2">
            <Diamond className="size-3.5" />
            {t("tasks:milestones.none")}
            {!value && <Check className="ml-auto size-3.5" />}
          </span>
        </MenuItem>
        {isPending && (
          <p role="status" className="px-2 py-2 text-xs text-muted-foreground">
            {t("tasks:milestones.loading")}
          </p>
        )}
        {isError && (
          <div role="alert" className="px-2 py-2 text-xs">
            <p>{t("tasks:milestones.loadError")}</p>
            <Button size="xs" variant="ghost" onClick={() => void refetch()}>
              {t("common:error.tryAgain")}
            </Button>
          </div>
        )}
        {data.map((m) => {
          const releaseName = m.releaseId
            ? releases.find((release) => release.id === m.releaseId)?.name
            : undefined;
          return (
            <MenuItem
              key={m.id}
              aria-label={releaseName ? `${m.title} · ${releaseName}` : m.title}
              onClick={() => onChange(m.id)}
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                <Diamond aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate" title={m.title}>
                  {m.title}
                </span>
                {releaseName && (
                  <span
                    className="flex min-w-0 max-w-[45%] items-center gap-1 text-xs text-muted-foreground"
                    title={releaseName}
                  >
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{releaseName}</span>
                  </span>
                )}
                {value === m.id && (
                  <Check aria-hidden="true" className="size-3.5 shrink-0" />
                )}
              </span>
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}
