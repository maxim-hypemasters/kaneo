import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ShipBlocker } from "@/fetchers/agent/get-task-agent";
import { listedShipBlockers, shipBlockerKey } from "./ship-blocker-key";

type ShipBlockersProps = {
  /** Lets the Ship button point at the list. */
  id: string;
  blockers: readonly ShipBlocker[];
};

export function ShipBlockers({ id, blockers }: ShipBlockersProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const listed = listedShipBlockers(blockers);
  if (listed.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="space-y-1 px-2 pb-1">
      <h3
        id={headingId}
        className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
      >
        {t("tasks:aiAgent.blockers.title")}
      </h3>
      <ul
        id={id}
        className="list-disc space-y-0.5 ps-5 text-muted-foreground text-sm"
      >
        {listed.map((blocker) => (
          <li key={blocker}>{t(shipBlockerKey(blocker))}</li>
        ))}
      </ul>
    </section>
  );
}
