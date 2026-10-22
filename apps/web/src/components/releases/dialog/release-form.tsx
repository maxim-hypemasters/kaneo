import { Rocket } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReleaseMilestoneCandidate } from "@/fetchers/release/get-release-milestone-candidates";
import { useCreateRelease } from "@/hooks/mutations/release/use-create-release";
import { useUpdateRelease } from "@/hooks/mutations/release/use-update-release";
import { HttpError } from "@/lib/http-error";
import { formatReleaseDate } from "@/lib/releases/release-date";
import { toast } from "@/lib/toast";
import type { Release } from "@/types/release";
import {
  RELEASE_DATE_KIND_ORDER,
  RELEASE_DATE_KINDS,
} from "../release-date-kinds";
import { ReleaseDateField } from "./release-date-field";
import { ReleaseMilestonePicker } from "./release-milestone-picker";
import { useCanLinkReleaseMilestones } from "./use-can-link-release-milestones";
import { releaseDateLimits } from "./release-date-limits";
import {
  type ReleaseFormValues,
  releaseFormValues,
} from "./release-form-values";
import { suggestReleaseDates } from "./suggest-release-dates";
import { suggestReleaseName } from "./suggest-release-name";
import { type ReleaseFormErrors, validateRelease } from "./validate-release";

type ReleaseFormProps = {
  projectId: string;
  // null creates a release.
  release: Release | null;
  // The project's releases, for the suggested name and dates of a new one.
  releases: readonly Release[];
  today: string;
  onClose: () => void;
  onCreated?: (release: Omit<Release, "progress">) => void;
  onCreatingChange: (creating: boolean) => void;
};

export function ReleaseForm({
  projectId,
  release,
  releases,
  today,
  onClose,
  onCreated,
  onCreatingChange,
}: ReleaseFormProps) {
  const { t } = useTranslation();
  const createRelease = useCreateRelease();
  const updateRelease = useUpdateRelease();
  const [values, setValues] = useState<ReleaseFormValues>(() =>
    releaseFormValues(
      release,
      release ? null : suggestReleaseDates(releases, today),
      release ? "" : suggestReleaseName(releases),
    ),
  );
  const [errors, setErrors] = useState<ReleaseFormErrors>({});
  const [milestones, setMilestones] = useState<ReleaseMilestoneCandidate[]>([]);
  const [milestoneConflict, setMilestoneConflict] = useState(false);
  const [conflictVersion, setConflictVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const focusNameAfterSave = useRef(false);
  const nameId = useId();
  const nameErrorId = useId();
  const isEditing = release !== null;
  const isPending =
    submitting || createRelease.isPending || updateRelease.isPending;
  const creationPending = !isEditing && isPending;
  const canLinkMilestones = useCanLinkReleaseMilestones(!isEditing);

  useEffect(() => {
    if (!isPending && errors.name && focusNameAfterSave.current) {
      focusNameAfterSave.current = false;
      nameRef.current?.focus();
    }
  }, [isPending, errors.name]);

  const errorText = (field: keyof ReleaseFormErrors) => {
    const error = errors[field];
    if (!error) return undefined;
    return t(error.key, {
      date: error.day ? formatReleaseDate(error.day, { today }) : "",
    });
  };

  const setField = <K extends keyof ReleaseFormValues>(
    field: K,
    value: ReleaseFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field as keyof ReleaseFormErrors];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || submittingRef.current) return;
    const found = validateRelease(values);
    const { startDate, codeFreezeDate, submissionDate } = values;
    if (
      Object.keys(found).length > 0 ||
      !startDate ||
      !codeFreezeDate ||
      !submissionDate
    ) {
      setErrors(found);
      return;
    }
    const data = {
      name: values.name.trim(),
      startDate,
      codeFreezeDate,
      submissionDate,
    };

    submittingRef.current = true;
    setSubmitting(true);
    setMilestoneConflict(false);
    if (!isEditing) onCreatingChange(true);
    try {
      if (release) {
        await updateRelease.mutateAsync({ id: release.id, projectId, data });
        toast.success(t("tasks:releases.dialog.updateSuccess"), {
          icon: Rocket,
        });
      } else {
        const created = await createRelease.mutateAsync({
          projectId,
          data: {
            ...data,
            ...(milestones.length > 0
              ? { milestoneIds: milestones.map(({ id }) => id) }
              : {}),
          },
        });
        toast.success(t("tasks:releases.dialog.createSuccess"), {
          icon: Rocket,
        });
        onCreated?.(created);
      }
      onClose();
    } catch (submitError) {
      if (
        submitError instanceof HttpError &&
        submitError.code === "MILESTONE_SELECTION_CONFLICT"
      ) {
        setMilestoneConflict(true);
        setConflictVersion((version) => version + 1);
        return;
      }
      if (
        submitError instanceof HttpError &&
        submitError.status === 409 &&
        (isEditing ||
          submitError.code === "RELEASE_NAME_TAKEN" ||
          submitError.message ===
            "A release with this name already exists in this project")
      ) {
        setErrors((current) => ({
          ...current,
          name: { key: "tasks:releases.ux.nameTaken" },
        }));
        focusNameAfterSave.current = true;
        return;
      }
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : t(
              isEditing
                ? "tasks:releases.dialog.updateError"
                : "tasks:releases.dialog.createError",
            ),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      if (!isEditing) onCreatingChange(false);
    }
  };

  const nameError = errorText("name");

  return (
    <form className="contents" noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {t(
            isEditing
              ? "tasks:releases.dialog.editTitle"
              : "tasks:releases.dialog.createTitle",
          )}
        </DialogTitle>
        <DialogDescription>
          {t("tasks:releases.dialog.createDescription")}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={nameId}>{t("tasks:releases.dialog.nameLabel")}</Label>
          <Input
            ref={nameRef}
            type="text"
            id={nameId}
            value={values.name}
            disabled={creationPending}
            maxLength={100}
            autoComplete="off"
            placeholder={t("tasks:releases.dialog.namePlaceholder")}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            onChange={(event) => setField("name", event.target.value)}
          />
          {nameError ? (
            <p id={nameErrorId} className="text-destructive-foreground text-xs">
              {nameError}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {RELEASE_DATE_KIND_ORDER.map((kind) => {
            const field = RELEASE_DATE_KINDS[kind].field;
            return (
              <ReleaseDateField
                key={kind}
                kind={kind}
                value={values[field]}
                limits={releaseDateLimits(values, kind)}
                error={errorText(field)}
                today={today}
                disabled={creationPending}
                onChange={(day) => setField(field, day)}
              />
            );
          })}
        </div>
        {canLinkMilestones && (
          <ReleaseMilestonePicker
            projectId={projectId}
            value={milestones}
            onChange={(next) => {
              setMilestones(next);
              setMilestoneConflict(false);
            }}
            disabled={creationPending}
            conflict={milestoneConflict}
            conflictVersion={conflictVersion}
          />
        )}
      </DialogPanel>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={creationPending}
          onClick={onClose}
        >
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" loading={isPending}>
          {t(
            isEditing
              ? "tasks:releases.dialog.save"
              : "tasks:releases.dialog.create",
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
