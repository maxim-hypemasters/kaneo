import { useTranslation } from "react-i18next";

export type StreamingStatusValue = "answering" | "done" | "stopped" | "failed";

const STATUS_KEYS: Record<StreamingStatusValue, string> = {
  answering: "workspace:assistant.status.answering",
  done: "workspace:assistant.status.done",
  stopped: "workspace:assistant.status.stopped",
  failed: "workspace:assistant.status.failed",
};

// Announces when an answer starts and how it ended; the streamed words
// themselves are not read out one by one.
export function StreamingStatus({
  status,
}: {
  status: StreamingStatusValue | null;
}) {
  const { t } = useTranslation();
  return (
    <p role="status" className="sr-only">
      {status ? t(STATUS_KEYS[status]) : ""}
    </p>
  );
}
