import { type FormEvent, useId, useState } from "react";
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
import type { Team } from "@/fetchers/team/types";
import { useCreateTeam } from "@/hooks/mutations/team/use-create-team";
import { useUpdateTeam } from "@/hooks/mutations/team/use-update-team";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";
import { TEAM_NAME_MAX_LENGTH } from "./team-name-max-length";

export function TeamNameForm({
  team,
  workspaceId,
  onClose,
}: {
  team: Team | null;
  workspaceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createTeam = useCreateTeam(workspaceId);
  const updateTeam = useUpdateTeam(workspaceId);
  const [name, setName] = useState(team?.name ?? "");
  const [error, setError] = useState("");
  const nameId = useId();
  const errorId = useId();
  const isPending = createTeam.isPending || updateTeam.isPending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("teams:dialog.nameRequired"));
      return;
    }
    if (trimmed.length > TEAM_NAME_MAX_LENGTH) {
      setError(t("teams:dialog.nameTooLong", { max: TEAM_NAME_MAX_LENGTH }));
      return;
    }

    try {
      if (team) {
        await updateTeam.mutateAsync({ id: team.id, name: trimmed });
        toast.success(t("teams:dialog.renamed"));
      } else {
        await createTeam.mutateAsync(trimmed);
        toast.success(t("teams:dialog.created"));
      }
      onClose();
    } catch (submitError) {
      if (submitError instanceof HttpError && submitError.status === 409) {
        setError(t("teams:dialog.nameTaken"));
        return;
      }
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : t(team ? "teams:dialog.renameError" : "teams:dialog.createError"),
      );
    }
  };

  return (
    <form className="contents" noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {t(team ? "teams:dialog.renameTitle" : "teams:dialog.createTitle")}
        </DialogTitle>
        <DialogDescription>
          {t(
            team
              ? "teams:dialog.renameDescription"
              : "teams:dialog.createDescription",
          )}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="space-y-2">
        <Label htmlFor={nameId}>{t("teams:dialog.nameLabel")}</Label>
        <Input
          id={nameId}
          value={name}
          autoFocus
          maxLength={TEAM_NAME_MAX_LENGTH}
          placeholder={t("teams:dialog.namePlaceholder")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
        />
        {error ? (
          <p id={errorId} className="text-destructive-foreground text-xs">
            {error}
          </p>
        ) : null}
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {t(team ? "teams:dialog.save" : "teams:dialog.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
