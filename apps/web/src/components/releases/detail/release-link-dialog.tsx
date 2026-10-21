import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ReleaseLinkCandidate } from "@/fetchers/release/get-release-link-candidates";
import { useLinkReleaseItems } from "@/hooks/mutations/release/use-link-release-items";
import { useReleaseLinkCandidates } from "@/hooks/queries/release/use-release-link-candidates";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ReleaseLinkCandidateRow } from "./release-link-candidate-row";

export function ReleaseLinkDialog({
  projectId,
  releaseId,
  releaseName,
  kind,
  onClose,
}: {
  projectId: string;
  releaseId: string;
  releaseName: string;
  kind: "task" | "milestone";
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(
    new Map<string, ReleaseLinkCandidate>(),
  );
  const [error, setError] = useState<
    { succeeded: number; failed: number } | "save" | null
  >(null);
  const query = useDebouncedValue(search.trim(), 200);
  const candidates = useReleaseLinkCandidates(
    projectId,
    releaseId,
    kind,
    query,
    page,
    true,
  );
  const link = useLinkReleaseItems(projectId, releaseId, kind);
  const pending = link.isPending;
  const totalPages = candidates.data?.pagination.totalPages ?? 0;
  const title = t(
    kind === "milestone"
      ? "tasks:releases.link.milestonesTitle"
      : "tasks:releases.link.tasksTitle",
    { release: releaseName },
  );
  const searchLabel = t(
    kind === "milestone"
      ? "tasks:releases.link.searchMilestones"
      : "tasks:releases.link.searchTasks",
  );
  const setChecked = (candidate: ReleaseLinkCandidate, checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(candidate.id, candidate);
      else next.delete(candidate.id);
      return next;
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogPopup showCloseButton={!pending} className="max-w-xl">
        <form
          className="contents"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selected.size || pending) return;
            setError(null);
            try {
              const result = await link.mutateAsync([...selected.values()]);
              const successes = new Set(result.succeeded);
              setSelected(
                (current) =>
                  new Map([...current].filter(([id]) => !successes.has(id))),
              );
              if (!result.failed.length) onClose();
              else
                setError({
                  succeeded: result.succeeded.length,
                  failed: result.failed.length,
                });
            } catch {
              setError("save");
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-3">
            <Input
              autoFocus
              aria-label={searchLabel}
              placeholder={searchLabel}
              value={search}
              maxLength={255}
              disabled={pending}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <p
              role="status"
              aria-live="polite"
              className="text-xs text-muted-foreground"
            >
              {t("tasks:releases.link.selectedCount", { count: selected.size })}
            </p>
            {selected.size > 0 && (
              <div
                aria-label={t("tasks:releases.link.selected")}
                className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto"
              >
                {[...selected.values()].map((candidate) => (
                  <Button
                    key={candidate.id}
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={pending}
                    className="max-w-full"
                    aria-label={t("tasks:releases.link.remove", {
                      title: candidate.title,
                    })}
                    onClick={() => setChecked(candidate, false)}
                  >
                    <span className="truncate">{candidate.title}</span>
                    <X aria-hidden="true" />
                  </Button>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error === "save"
                  ? t("tasks:releases.link.saveError")
                  : t("tasks:releases.link.partialError", error)}
              </p>
            )}
            {candidates.isPending && (
              <p role="status" className="py-4 text-sm text-muted-foreground">
                {t("tasks:releases.link.loading")}
              </p>
            )}
            {candidates.isError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 text-sm"
              >
                <p>{t("tasks:releases.link.loadError")}</p>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending || candidates.isFetching}
                  onClick={() => void candidates.refetch()}
                >
                  {t("common:error.tryAgain")}
                </Button>
              </div>
            )}
            {candidates.data &&
              candidates.data.data.length === 0 &&
              !candidates.isError && (
                <p className="py-4 text-sm text-muted-foreground">
                  {t(
                    query
                      ? "tasks:releases.link.noMatches"
                      : kind === "milestone"
                        ? "tasks:releases.link.noMilestones"
                        : "tasks:releases.link.noTasks",
                  )}
                </p>
              )}
            {candidates.data && candidates.data.data.length > 0 && (
              <fieldset
                disabled={pending}
                className="min-w-0 rounded-lg border border-border p-1"
              >
                <legend className="sr-only">{title}</legend>
                {candidates.data.data.map((candidate) => (
                  <ReleaseLinkCandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    checked={selected.has(candidate.id)}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      setChecked(candidate, checked)
                    }
                  />
                ))}
              </fieldset>
            )}
            {(totalPages > 1 || page > 1) && (
              <nav
                aria-label={t("common:pagination.label")}
                className="flex items-center justify-between gap-2"
              >
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending || page <= 1 || candidates.isFetching}
                  aria-label={t("common:pagination.previousPage")}
                  onClick={() => setPage((current) => current - 1)}
                >
                  {t("common:pagination.previous")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("tasks:releases.link.pageLabel", {
                    page,
                    total: Math.max(page, totalPages),
                  })}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={
                    pending || page >= totalPages || candidates.isFetching
                  }
                  aria-label={t("common:pagination.nextPage")}
                  onClick={() => setPage((current) => current + 1)}
                >
                  {t("common:pagination.next")}
                </Button>
              </nav>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onClose}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={pending || selected.size === 0}>
              {t(
                pending
                  ? "tasks:releases.link.linking"
                  : "tasks:releases.link.linkSelected",
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
