import { useEffect, useRef, useState } from "react";
import { useShipTask } from "@/hooks/mutations/agent/use-ship-task";
import { focusIsFree } from "./focus-is-free";

type ShipFlowInput = {
  taskId: string;
  projectId: string;
  canShip: boolean;
  activeRunId: string | null;
  /** When the agent state last settled, fetched or failed. */
  settledAt: number;
};

/**
 * Ship asks for confirmation first. The dialog lives outside the Ship
 * button, which a socket update can remove while it is open; it closes on
 * purpose when the task can no longer ship. Focus then goes to the run's
 * status if a run started, else back to the Ship button, else, with the
 * button gone, to the readiness score.
 */
export function useShipFlow({
  taskId,
  projectId,
  canShip,
  activeRunId,
  settledAt,
}: ShipFlowInput) {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useShipTask();
  const sectionRef = useRef<HTMLElement>(null);
  const scoreRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusRun = useRef(false);

  if (open && !canShip && !isPending) setOpen(false);

  // Shipping refetches the agent state, and only that refetch decides,
  // whether it succeeds or fails: focus the run if it started, and never
  // later, for someone else's run or while someone works elsewhere.
  useEffect(() => {
    if (!focusRun.current) return;
    focusRun.current = false;
    if (activeRunId && focusIsFree(sectionRef.current)) {
      statusRef.current?.focus();
    }
  }, [settledAt, activeRunId]);

  return {
    open,
    pending: isPending,
    sectionRef,
    scoreRef,
    statusRef,
    openDialog: (button: HTMLElement) => {
      opener.current = button;
      setOpen(true);
    },
    setOpen,
    confirm: () =>
      mutate(
        { taskId, projectId },
        {
          onSuccess: () => {
            focusRun.current = true;
            setOpen(false);
          },
        },
      ),
    finalFocus: () =>
      [statusRef.current, opener.current, scoreRef.current].find(
        (element) => element?.isConnected,
      ) ?? (true as const),
  };
}
