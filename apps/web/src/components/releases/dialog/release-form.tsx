import { Rocket } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
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
import { releaseDateLimits } from "./release-date-limits";
import {
  type ReleaseFormValues,
  releaseFormValues,
} from "./release-form-values";
import { suggestReleaseDates } from "./suggest-release-dates";
import { type ReleaseFormErrors, validateRelease } from "./validate-release";

type ReleaseFormProps = {
  projectId: string;
  // null creates a release.
  release: Release | null;
  // The project's releases, for the suggested dates of a new one.
  releases: readonly Release[];
  today: string;
  onClose: () => void;
  onCreated?: (release: Omit<Release, "progress">) => void;
};

export function ReleaseForm({
  projectId,
  release,
  releases,
  today,
  onClose,
  onCreated,
}: ReleaseFormProps) {
  const { t } = useTranslation();
  const createRelease = useCreateRelease();
  const updateRelease = useUpdateRelease();
  const [values, setValues] = useState<ReleaseFormValues>(() =>
    releaseFormValues(
      release,
      release ? null : suggestReleaseDates(releases, today),
    ),
  );
  const [errors, setErrors] = useState<ReleaseFormErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const nameErrorId = useId();
  const descriptionId = useId();
  const isEditing = release !== null;
  const isPending = createRelease.isPending || updateRelease.isPending;

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
    if (isPending) return;
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
    const description = values.description.trim();
    const data = {
      name: values.name.trim(),
      description: description || null,
      startDate,
      codeFreezeDate,
      submissionDate,
    };

    try {
      if (release) {
        await updateRelease.mutateAsync({ id: release.id, projectId, data });
        toast.success(t("tasks:releases.dialog.updateSuccess"), {
          icon: Rocket,
        });
      } else {
        const created = await createRelease.mutateAsync({ projectId, data });
        toast.success(t("tasks:releases.dialog.createSuccess"), {
          icon: Rocket,
        });
        onCreated?.(created);
      }
      onClose();
    } catch (submitError) {
      // Names are unique within a project: the one failure the form can tie
      // to a field, in the viewer's language rather than the API's English.
      if (submitError instanceof HttpError && submitError.status === 409) {
        setErrors((current) => ({
          ...current,
          name: { key: "tasks:releases.ux.nameTaken" },
        }));
        nameRef.current?.focus();
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
            id={nameId}
            value={values.name}
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
                onChange={(day) => setField(field, day)}
              />
            );
          })}
        </div>
        <div className="space-y-2">
          <Label htmlFor={descriptionId}>
            {t("tasks:releases.dialog.descriptionLabel")}
          </Label>
          <Textarea
            id={descriptionId}
            value={values.description}
            maxLength={10_000}
            placeholder={t("tasks:releases.dialog.descriptionPlaceholder")}
            onChange={(event) => setField("description", event.target.value)}
          />
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
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
