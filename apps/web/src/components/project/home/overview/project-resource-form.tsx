import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/components/project/error-message";
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
import type { ProjectLink } from "@/fetchers/project-link/types";
import { useCreateProjectLink } from "@/hooks/mutations/project-link/use-create-project-link";
import { useUpdateProjectLink } from "@/hooks/mutations/project-link/use-update-project-link";
import { toast } from "@/lib/toast";
import { toResourceUrl } from "./to-resource-url";

// The API's limits, so the form stops where a save would be refused.
const URL_MAX_LENGTH = 2048;
const TITLE_MAX_LENGTH = 200;

export function ProjectResourceForm({
  link,
  projectId,
  onClose,
}: {
  link: ProjectLink | null;
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createLink = useCreateProjectLink(projectId);
  const updateLink = useUpdateProjectLink(projectId);
  const [url, setUrl] = useState(link?.url ?? "");
  const [title, setTitle] = useState(link?.title ?? "");
  const [urlError, setUrlError] = useState("");
  const [titleError, setTitleError] = useState("");
  const urlId = useId();
  const urlErrorId = useId();
  const titleId = useId();
  const titleErrorId = useId();
  const isPending = createLink.isPending || updateLink.isPending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const resourceUrl = toResourceUrl(url);
    const trimmedTitle = title.trim();
    if (!resourceUrl) setUrlError(t("tasks:projectHome.resources.invalidUrl"));
    if (!trimmedTitle)
      setTitleError(t("tasks:projectHome.resources.titleRequired"));
    if (!resourceUrl || !trimmedTitle) return;

    try {
      const saved = { url: resourceUrl, title: trimmedTitle };
      if (link) await updateLink.mutateAsync({ id: link.id, ...saved });
      else await createLink.mutateAsync(saved);
      onClose();
    } catch (error) {
      toast.error(
        errorMessage(error, t("tasks:projectHome.resources.saveError")),
      );
    }
  };

  return (
    <form className="contents" noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {t(
            link
              ? "tasks:projectHome.resources.editTitle"
              : "tasks:projectHome.resources.add",
          )}
        </DialogTitle>
        <DialogDescription>
          {t("tasks:projectHome.resources.dialogDescription")}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={urlId}>{t("tasks:projectHome.resources.url")}</Label>
          <Input
            id={urlId}
            value={url}
            autoFocus
            inputMode="url"
            autoComplete="off"
            maxLength={URL_MAX_LENGTH}
            placeholder={t("tasks:projectHome.resources.urlPlaceholder")}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? urlErrorId : undefined}
            onChange={(event) => {
              setUrl(event.target.value);
              setUrlError("");
            }}
          />
          {urlError ? (
            <p id={urlErrorId} className="text-destructive-foreground text-xs">
              {urlError}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={titleId}>
            {t("tasks:projectHome.resources.linkTitle")}
          </Label>
          <Input
            id={titleId}
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            placeholder={t("tasks:projectHome.resources.titlePlaceholder")}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? titleErrorId : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleError("");
            }}
          />
          {titleError ? (
            <p
              id={titleErrorId}
              className="text-destructive-foreground text-xs"
            >
              {titleError}
            </p>
          ) : null}
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {t(
            link
              ? "tasks:projectHome.resources.save"
              : "tasks:projectHome.resources.add",
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
