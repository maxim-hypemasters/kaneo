import { Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewWorkMenu } from "@/components/shared/new-work-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TaskType } from "@/types/task";

// Absent onCreate for viewers who can't create tasks.
export function ReleaseDetailEmpty({
  onCreate,
}: {
  onCreate?: (type: TaskType) => void;
}) {
  const { t } = useTranslation();

  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Rocket aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">
          {t("tasks:releases.detail.empty")}
        </EmptyTitle>
        <EmptyDescription>
          {t("tasks:releases.detail.emptyHint")}
        </EmptyDescription>
      </EmptyHeader>
      {onCreate ? (
        <EmptyContent>
          <NewWorkMenu variant="outline" onSelect={onCreate} />
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
