import { Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ReleaseLinkKind } from "@/fetchers/release/get-release-link-candidates";
import { ReleaseLinkMenu } from "./release-link-menu";

export function ReleaseDetailEmpty({
  onLink,
}: {
  onLink?: (kind: ReleaseLinkKind) => void;
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
          {t("tasks:releases.detail.emptyLinkHint")}
        </EmptyDescription>
      </EmptyHeader>
      {onLink ? (
        <EmptyContent>
          <ReleaseLinkMenu onLink={onLink} />
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
