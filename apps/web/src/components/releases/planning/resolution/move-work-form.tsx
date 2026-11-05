import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { releaseFormValues } from "@/components/releases/dialog/release-form-values";
import { suggestReleaseDates } from "@/components/releases/dialog/suggest-release-dates";
import { suggestReleaseName } from "@/components/releases/dialog/suggest-release-name";
import {
  type ReleaseFormErrors,
  validateRelease,
} from "@/components/releases/dialog/validate-release";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import type { Release } from "@/types/release";
import type {
  ReleasePlanChanges,
  ReleasePlanMoveTarget,
  ReleasePlanPreview,
} from "@/types/release-plan";
import { DraftReleaseFields } from "./draft-release-fields";
import {
  downstreamTasks,
  moveMilestone,
  moveTasks,
  nextRelease,
  type MoveSelection,
} from "./resolution-model";
import { ResolutionTaskLabel } from "./resolution-task-label";

export function MoveWorkForm({
  selection,
  title,
  preview,
  release,
  releases,
  changes,
  disabled,
  onSubmit,
}: {
  selection: MoveSelection;
  title: string;
  preview: ReleasePlanPreview;
  release: Release;
  releases: Release[];
  changes: ReleasePlanChanges;
  disabled: boolean;
  onSubmit: (changes: ReleasePlanChanges) => void;
}) {
  const { t } = useTranslation();
  const today = useReleaseToday();
  const formId = useId();
  const [destination] = useState(() => nextRelease(release, releases));
  const [dependents] = useState(() =>
    selection.kind === "task"
      ? downstreamTasks(preview, selection.task.taskId)
      : [],
  );
  const [selected, setSelected] = useState(() =>
    dependents.map(({ taskId }) => taskId),
  );
  const [values, setValues] = useState(() =>
    changes.newRelease
      ? {
          name: changes.newRelease.name,
          startDate: changes.newRelease.startDate,
          codeFreezeDate: changes.newRelease.codeFreezeDate,
          submissionDate: changes.newRelease.submissionDate,
        }
      : releaseFormValues(
          null,
          suggestReleaseDates(releases, today),
          suggestReleaseName(releases),
        ),
  );
  const [errors, setErrors] = useState<ReleaseFormErrors>({});
  const [startTooEarly, setStartTooEarly] = useState(false);
  const stage = (
    target: ReleasePlanMoveTarget,
    newRelease?: ReleasePlanChanges["newRelease"],
  ) => {
    if (selection.kind === "milestone" && selection.moveMilestone) {
      onSubmit(
        moveMilestone(changes, selection.milestoneId, target, newRelease),
      );
      return;
    }
    const ids =
      selection.kind === "task"
        ? [selection.task.taskId, ...selected]
        : selection.taskIds;
    onSubmit(moveTasks(changes, ids, target, newRelease));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    if (destination) {
      stage({ releaseId: destination.id });
      return;
    }
    const found = validateRelease(values);
    const lateStart = Boolean(
      values.startDate && values.startDate <= release.startDate,
    );
    if (releases.some((candidate) => candidate.name === values.name.trim()))
      found.name = { key: "tasks:releases.ux.nameTaken" };
    setErrors(found);
    setStartTooEarly(lateStart);
    if (
      Object.keys(found).length ||
      lateStart ||
      !values.startDate ||
      !values.codeFreezeDate ||
      !values.submissionDate
    )
      return;
    const newRelease = {
      key: changes.newRelease?.key ?? crypto.randomUUID(),
      name: values.name.trim(),
      startDate: values.startDate,
      codeFreezeDate: values.codeFreezeDate,
      submissionDate: values.submissionDate,
    };
    stage({ draftKey: newRelease.key }, newRelease);
  };
  return (
    <form id={formId} onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {t("tasks:releases.planning.resolution.draftHelp")}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="space-y-5">
        {selection.kind === "task" ? (
          <ResolutionTaskLabel task={selection.task} />
        ) : (
          <div className="space-y-1 text-sm">
            <p>
              {t("tasks:releases.planning.resolution.moveCount", {
                count: selection.taskIds.length,
              })}
            </p>
            {selection.kind === "milestone" && (
              <p className="text-xs text-muted-foreground">
                {t("tasks:releases.planning.resolution.moveMilestoneScope")}
              </p>
            )}
          </div>
        )}
        {destination ? (
          <div className="space-y-1 text-sm">
            <p>
              {t("tasks:releases.planning.resolution.destination", {
                release: destination.name,
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatReleaseRange(
                destination.startDate,
                destination.submissionDate,
                { today },
              )}
            </p>
          </div>
        ) : (
          <DraftReleaseFields
            values={values}
            errors={errors}
            today={today}
            sourceStart={release.startDate}
            disabled={disabled}
            startTooEarly={startTooEarly}
            onChange={(next) => {
              setValues(next);
              setErrors({});
              setStartTooEarly(false);
            }}
          />
        )}
        {dependents.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-medium">
              {t("tasks:releases.planning.resolution.dependents")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("tasks:releases.planning.resolution.dependentsHelp")}
            </p>
            <CheckboxGroup
              aria-label={t("tasks:releases.planning.resolution.dependents")}
              className="w-full gap-0 divide-y"
              value={selected}
              onValueChange={(ids) => {
                if (!disabled) setSelected(ids.map(String));
              }}
            >
              {dependents.map((dependent) => (
                <Label
                  key={dependent.taskId}
                  className="w-full items-start py-3 first:pt-0 last:pb-0 font-normal"
                >
                  <Checkbox
                    value={dependent.taskId}
                    disabled={disabled}
                    className="mt-0.5 shrink-0"
                  />
                  <ResolutionTaskLabel task={dependent} />
                </Label>
              ))}
            </CheckboxGroup>
          </section>
        )}
        <p className="text-xs text-muted-foreground">
          {t("tasks:releases.planning.resolution.clearsPlacement")}
        </p>
      </DialogPanel>
      <DialogFooter>
        <Button type="submit" form={formId} disabled={disabled}>
          {t("tasks:releases.planning.resolution.updatePreview")}
        </Button>
      </DialogFooter>
    </form>
  );
}
