import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheckIcon, PlayIcon } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStartTask } from "@/hooks/mutations/agent/use-start-task";
import {
  taskAgentPromptQuery,
  useTaskAgentPrompt,
} from "@/hooks/queries/agent/use-task-agent-prompt";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { toast } from "@/lib/toast";
import { focusIsFree } from "./focus-is-free";
import { startToastKey } from "./start-toast-key";

type StartFlowInput = {
  taskId: string;
  projectId: string;
  /** When the agent state last settled, fetched or failed. */
  settledAt: number;
  sectionRef: RefObject<HTMLElement | null>;
  scoreRef: RefObject<HTMLElement | null>;
  statusRef: RefObject<HTMLElement | null>;
};

/**
 * Start task and Copy prompt both move the task to In Progress; Start also
 * has the runner open a draft pull request when it can. Their buttons go
 * once the task moves, so focus then goes to the run's status if a run
 * started, else to the readiness score, unless someone works elsewhere.
 *
 * Copy prompt fetches the prompt as the menu opens and copies it during the
 * click, as browsers require. When the copy fails, a dialog shows the
 * prompt to copy by hand, and the task moves only on request.
 */
export function useStartFlow({
  taskId,
  projectId,
  settledAt,
  sectionRef,
  scoreRef,
  statusRef,
}: StartFlowInput) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useStartTask();
  const [menuOpen, setMenuOpen] = useState(false);
  const prompt = useTaskAgentPrompt(taskId, { enabled: menuOpen });
  const [dialog, setDialog] = useState({ open: false, prompt: "" });
  const opener = useRef<HTMLElement | null>(null);
  const focusAfterStart = useRef(false);

  // Like Ship, only the refetch that follows decides where focus goes.
  useEffect(() => {
    if (!focusAfterStart.current) return;
    focusAfterStart.current = false;
    if (!focusIsFree(sectionRef.current)) return;
    (statusRef.current ?? scoreRef.current)?.focus();
  }, [settledAt, sectionRef, scoreRef, statusRef]);

  const start = (pullRequest: boolean, toastKey?: string) =>
    mutate(
      { taskId, projectId, pullRequest },
      {
        onSuccess: (result) => {
          focusAfterStart.current = true;
          setDialog((current) => ({ ...current, open: false }));
          toast.success(t(toastKey ?? startToastKey(result)), {
            icon: toastKey ? ClipboardCheckIcon : PlayIcon,
          });
        },
      },
    );

  const showPrompt = async (text: string | Promise<string>) => {
    try {
      const value = await text;
      const focused = document.activeElement;
      opener.current =
        focused instanceof HTMLElement && focused !== document.body
          ? focused
          : null;
      setDialog({ open: true, prompt: value });
    } catch {
      toast.error(t("tasks:aiAgent.errors.copyPrompt"));
    }
  };

  const copyPrompt = () => {
    // The prompt fetched as the menu opened, unless that fetch is still
    // running or failed.
    const fetched =
      prompt.status === "success" && !prompt.isFetching
        ? prompt.data.prompt
        : null;
    const text =
      fetched ??
      queryClient
        .fetchQuery(taskAgentPromptQuery(taskId))
        .then((loaded) => loaded.prompt);
    // Before any await, while the click still allows copying.
    const copied = copyToClipboard(text);
    void copied.then((ok) =>
      ok ? start(false, "tasks:aiAgent.toast.promptCopied") : showPrompt(text),
    );
  };

  return {
    starting: isPending,
    start: () => start(true),
    copyPrompt,
    setMenuOpen,
    dialog: {
      open: dialog.open,
      prompt: dialog.prompt,
      close: () => setDialog((current) => ({ ...current, open: false })),
      start: () => start(false),
      finalFocus: () =>
        [opener.current, statusRef.current, scoreRef.current].find(
          (element) => element?.isConnected,
        ) ?? (true as const),
    },
  };
}
