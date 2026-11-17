import { TreePalm } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function TimeOffNoAccess() {
  const { t } = useTranslation();

  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TreePalm aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">
          {t("team:timeOff.noAccess.title")}
        </EmptyTitle>
        <EmptyDescription>
          {t("team:timeOff.noAccess.description")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
