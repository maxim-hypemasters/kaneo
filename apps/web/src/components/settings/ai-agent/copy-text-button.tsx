import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { toast } from "@/lib/toast";

type CopyTextButtonProps = {
  text: string;
  label: string;
  onCopied?: () => void;
};

export function CopyTextButton({ text, label, onCopied }: CopyTextButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      onCopied?.();
      return;
    }
    toast.error(t("settings:aiAgentPage.runner.copyFailed"));
  };

  const copiedLabel = t("settings:aiAgentPage.runner.copied");

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="xs"
        aria-label={copied ? copiedLabel : label}
        onClick={() => void copy()}
      >
        {copied ? (
          <CheckIcon aria-hidden="true" className="text-success-foreground" />
        ) : (
          <CopyIcon aria-hidden="true" />
        )}
        {copied ? copiedLabel : t("settings:aiAgentPage.runner.copy")}
      </Button>
      {/* Always mounted, so screen readers hear when the copy worked. */}
      <span role="status" className="sr-only">
        {copied ? copiedLabel : null}
      </span>
    </>
  );
}
