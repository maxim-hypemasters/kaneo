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

type ReleaseListEmptyProps = {
  // Absent for viewers who can't create releases.
  onCreate?: () => void;
};

export function ReleaseListEmpty({ onCreate }: ReleaseListEmptyProps) {
  const { t } = useTranslation();

  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Rocket aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("tasks:releases.empty.title")}</EmptyTitle>
        <EmptyDescription>
          {onCreate
            ? t("tasks:releases.empty.description")
            : t("tasks:releases.empty.readOnly")}
        </EmptyDescription>
      </EmptyHeader>
      {onCreate ? (
        <EmptyContent>
          <Button onClick={onCreate}>
            <Plus aria-hidden="true" />
            {t("tasks:releases.new")}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
