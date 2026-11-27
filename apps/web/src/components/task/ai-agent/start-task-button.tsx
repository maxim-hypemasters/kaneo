import { PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type StartTaskButtonProps = {
  pending: boolean;
  onStart: () => void;
};

export function StartTaskButton({ pending, onStart }: StartTaskButtonProps) {
  const { t } = useTranslation();

  return (
    // Stays focusable while Start runs, like the Check button.
    <Button
      type="button"
      size="xs"
      aria-disabled={pending || undefined}
      className="aria-disabled:pointer-events-none aria-disabled:opacity-64"
      onClick={pending ? undefined : onStart}
    >
      <PlayIcon aria-hidden="true" />
      {t("tasks:aiAgent.startTask")}
    </Button>
  );
}
