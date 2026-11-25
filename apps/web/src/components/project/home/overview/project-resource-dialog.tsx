import { Dialog, DialogPopup } from "@/components/ui/dialog";
import type { ProjectLink } from "@/fetchers/project-link/types";
import { ProjectResourceForm } from "./project-resource-form";

// Adds a link, or edits `link`.
export function ProjectResourceDialog({
  open,
  onOpenChange,
  link,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: ProjectLink | null;
  projectId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-md">
        <ProjectResourceForm
          key={link?.id ?? "new"}
          link={link}
          projectId={projectId}
          onClose={() => onOpenChange(false)}
        />
      </DialogPopup>
    </Dialog>
  );
}
