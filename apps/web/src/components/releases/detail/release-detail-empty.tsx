import { Plus, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Absent onAddTask for viewers who can't create tasks.
export function ReleaseDetailEmpty({ onAddTask }: { onAddTask?: () => void }) {
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
      {onAddTask ? (
        <EmptyContent>
          <Button variant="outline" onClick={onAddTask}>
            <Plus aria-hidden="true" />
            {t("tasks:releases.detail.addTask")}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
