import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AssistantTurnFailure,
  failureFromRequestError,
} from "@/components/assistant/assistant-error-message";
import type { AssistantStreamEvent } from "@/components/assistant/assistant-stream-event";
import { parseAssistantStreamEvent } from "@/components/assistant/parse-assistant-stream-event";
import continueAssistantTurn from "@/fetchers/assistant/continue-assistant-turn";
import type { AssistantChatDetail } from "@/fetchers/assistant/get-assistant-chat";
import type { AssistantStatus } from "@/fetchers/assistant/get-assistant-status";
import sendAssistantMessage from "@/fetchers/assistant/send-assistant-message";
import startAssistantChat from "@/fetchers/assistant/start-assistant-chat";
import { assistantKeys } from "@/hooks/queries/assistant/assistant-keys";
import {
  addLocalStoppedAnswer,
  addLocalUserMessage,
  applyAssistantEvent,
  removeLocalMessages,
} from "@/lib/apply-assistant-event";
import { readSseEvents } from "@/lib/read-sse-events";

export type AssistantTurnKind = "start" | "send" | "continue";

export type AssistantTurnRequest =
  | { kind: "start"; content: string }
  | { kind: "send"; chatId: string; content: string }
  | { kind: "continue"; chatId: string };

export type AssistantTurnError = AssistantTurnFailure & {
  chatId: string | null;
  /** Whether Retry resumes the chat with Continue. */
  canContinue: boolean;
};

export type AssistantTurnState = {
  phase: "idle" | "connecting" | "streaming";
  kind: AssistantTurnKind | null;
  /** The running or last turn's chat; null until a new chat has its id. */
  chatId: string | null;
  /** A new chat's first message, shown until the chat exists. */
  pendingUserText: string | null;
  /** Answer text streamed since the last saved message. */
  draft: string;
  error: AssistantTurnError | null;
  /** The chat whose last answer stopped at the length limit. */
  truncatedChatId: string | null;
  /** The chat whose last turn the user stopped. */
  stoppedChatId: string | null;
};

const IDLE: AssistantTurnState = {
  phase: "idle",
  kind: null,
  chatId: null,
  pendingUserText: null,
  draft: "",
  error: null,
  truncatedChatId: null,
  stoppedChatId: null,
};

// After Stop the server saves what streamed as an interrupted answer. The
// chat is refetched a moment later, so the refetch includes it.
const STOP_REFETCH_DELAY_MS = 1200;

// Codes that change what the status endpoint reports.
const STATUS_CODES: ReadonlySet<string> = new Set([
  "OPENROUTER_KEY_INVALID",
  "OPENROUTER_CREDITS",
  "ASSISTANT_NOT_CONFIGURED",
  "ASSISTANT_KEY_UNREADABLE",
  "ASSISTANT_DISABLED",
]);

function browserTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return /^[A-Za-z0-9_+:/-]{1,64}$/.test(zone) ? zone : undefined;
  } catch {
    return undefined;
  }
}

const nextFrame = (callback: () => void) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : window.setTimeout(callback, 16);
const cancelFrame = (handle: number) =>
  typeof cancelAnimationFrame === "function"
    ? cancelAnimationFrame(handle)
    : window.clearTimeout(handle);

function openTurn(
  workspaceId: string,
  request: AssistantTurnRequest,
  signal: AbortSignal,
): Promise<Response> {
  const timeZone = browserTimeZone();
  const zone = timeZone ? { timeZone } : {};
  switch (request.kind) {
    case "start":
      return startAssistantChat(
        workspaceId,
        { content: request.content, ...zone },
        signal,
      );
    case "send":
      return sendAssistantMessage(
        workspaceId,
        request.chatId,
        { content: request.content, ...zone },
        signal,
      );
    case "continue":
      return continueAssistantTurn(workspaceId, request.chatId, zone, signal);
  }
}

/**
 * Drives one assistant turn at a time: opens the stream, applies its events
 * to the chat's cache, and keeps the streaming answer text in state, flushed
 * once per animation frame. It must live above anything keyed by chat id, so
 * that a new chat getting its id (and the URL changing) doesn't abort it.
 * Every way a turn ends (done, error, Stop, a lost connection) refreshes the
 * chat list and the chat.
 */
export function useAssistantTurn({
  workspaceId,
  onChatCreated,
}: {
  workspaceId: string;
  onChatCreated?: (chatId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AssistantTurnState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onChatCreatedRef = useRef(onChatCreated);
  onChatCreatedRef.current = onChatCreated;
  // Delta text not yet rendered, and all text since the last saved message.
  const bufferRef = useRef("");
  const draftRef = useRef("");
  const frameRef = useRef<number | null>(null);
  const timersRef = useRef(new Set<number>());

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      if (frameRef.current !== null) cancelFrame(frameRef.current);
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const flushDraft = useCallback(() => {
    frameRef.current = null;
    const text = bufferRef.current;
    if (!text) return;
    bufferRef.current = "";
    setState((current) => ({ ...current, draft: current.draft + text }));
  }, []);

  const resetDraft = useCallback(() => {
    if (frameRef.current !== null) cancelFrame(frameRef.current);
    frameRef.current = null;
    bufferRef.current = "";
    draftRef.current = "";
  }, []);

  const run = useCallback(
    (request: AssistantTurnRequest): Promise<boolean> => {
      if (controllerRef.current) return Promise.resolve(false);
      const controller = new AbortController();
      controllerRef.current = controller;
      let chatId = request.kind === "start" ? null : request.chatId;
      const content = request.kind === "continue" ? null : request.content;
      const chatKey = (id: string) => assistantKeys.chat(workspaceId, id);
      const updateChat = (
        id: string,
        update: (
          detail: AssistantChatDetail | undefined,
        ) => AssistantChatDetail | undefined,
      ) => queryClient.setQueryData<AssistantChatDetail>(chatKey(id), update);
      // A fetch of the chat that started before the turn would land after
      // the turn's own rows and replace them with an older transcript.
      // Cancelling reverts the query synchronously, so the turn's updates
      // that follow apply on top of the data it had.
      const cancelChatFetch = (id: string) =>
        void queryClient.cancelQueries({ queryKey: chatKey(id) });

      resetDraft();
      setState({
        ...IDLE,
        phase: "connecting",
        kind: request.kind,
        chatId,
        pendingUserText: request.kind === "start" ? request.content : null,
      });
      if (chatId) cancelChatFetch(chatId);
      if (request.kind === "send") {
        updateChat(request.chatId, (detail) =>
          addLocalUserMessage(detail, request.content),
        );
      }

      const refreshStatus = (code: string | null) => {
        const status = queryClient.getQueryData<AssistantStatus>(
          assistantKeys.status(workspaceId),
        );
        if ((code && STATUS_CODES.has(code)) || (!code && status?.reason)) {
          void queryClient.invalidateQueries({
            queryKey: assistantKeys.status(workspaceId),
          });
        }
      };

      const handle = (event: AssistantStreamEvent) => {
        switch (event.type) {
          case "chat": {
            const id = event.chat.id;
            chatId = id;
            cancelChatFetch(id);
            updateChat(id, (detail) =>
              addLocalUserMessage(
                applyAssistantEvent(detail, event),
                content ?? "",
              ),
            );
            setState((current) => ({ ...current, chatId: id }));
            void queryClient.invalidateQueries({
              queryKey: assistantKeys.chats(workspaceId),
            });
            if (mountedRef.current) onChatCreatedRef.current?.(id);
            return;
          }
          case "delta":
            bufferRef.current += event.text;
            draftRef.current += event.text;
            if (frameRef.current === null) {
              frameRef.current = nextFrame(flushDraft);
            }
            return;
          case "message":
            if (chatId) {
              const id = chatId;
              updateChat(id, (detail) => applyAssistantEvent(detail, event));
            }
            if (event.message.role === "assistant") {
              // The saved row now holds the streamed text.
              resetDraft();
              setState((current) => ({ ...current, draft: "" }));
            }
            return;
          case "done":
            if (chatId) {
              const id = chatId;
              updateChat(id, (detail) => applyAssistantEvent(detail, event));
            }
            return;
          case "error":
            return;
        }
      };

      let resolveAccepted: (accepted: boolean) => void = () => {};
      const accepted = new Promise<boolean>((resolve) => {
        resolveAccepted = resolve;
      });

      const finish = (outcome: {
        stopped: boolean;
        error: AssistantTurnError | null;
        truncated: boolean;
      }) => {
        const id = chatId;
        const stoppedText = outcome.stopped ? draftRef.current : "";
        resetDraft();
        controllerRef.current = null;

        void queryClient.invalidateQueries({
          queryKey: assistantKeys.chats(workspaceId),
        });
        if (id) {
          if (outcome.stopped) {
            updateChat(id, (detail) =>
              addLocalStoppedAnswer(detail, stoppedText),
            );
            const timer = window.setTimeout(() => {
              timersRef.current.delete(timer);
              void queryClient.invalidateQueries({ queryKey: chatKey(id) });
              void queryClient.invalidateQueries({
                queryKey: assistantKeys.chats(workspaceId),
              });
            }, STOP_REFETCH_DELAY_MS);
            timersRef.current.add(timer);
          } else {
            void queryClient.invalidateQueries({ queryKey: chatKey(id) });
          }
        }
        if (!outcome.stopped) refreshStatus(outcome.error?.code ?? null);

        setState({
          ...IDLE,
          kind: request.kind,
          chatId: id,
          error: outcome.error,
          truncatedChatId: outcome.truncated ? id : null,
          stoppedChatId: outcome.stopped ? id : null,
        });
      };

      void (async () => {
        let response: Response;
        try {
          response = await openTurn(workspaceId, request, controller.signal);
        } catch (error) {
          controllerRef.current = null;
          resolveAccepted(false);
          resetDraft();
          if (chatId) {
            const id = chatId;
            updateChat(id, removeLocalMessages);
          }
          if (controller.signal.aborted) {
            // Stopped while connecting; the server may still have taken it.
            void queryClient.invalidateQueries({
              queryKey: assistantKeys.chats(workspaceId),
            });
            if (chatId) {
              void queryClient.invalidateQueries({ queryKey: chatKey(chatId) });
            }
            setState({ ...IDLE, chatId });
            return;
          }
          const failure = failureFromRequestError(error);
          refreshStatus(failure.code);
          if (chatId) {
            // A refused continue can mean the chat changed (answered
            // elsewhere, or now waits for approvals).
            void queryClient.invalidateQueries({ queryKey: chatKey(chatId) });
          }
          setState({
            ...IDLE,
            kind: request.kind,
            chatId,
            error: {
              ...failure,
              chatId,
              // A refused message was never saved, so the composer gets it
              // back instead; only Continue can be retried as it was.
              canContinue: request.kind === "continue" && failure.retryable,
            },
          });
          return;
        }

        resolveAccepted(true);
        setState((current) => ({ ...current, phase: "streaming" }));

        let error: AssistantTurnError | null = null;
        let truncated = false;
        let ended = false;
        try {
          if (response.body) {
            for await (const sse of readSseEvents(response.body)) {
              const event = parseAssistantStreamEvent(sse.data);
              if (!event) continue;
              handle(event);
              if (event.type === "error") {
                error = {
                  code: event.code,
                  retryable: event.retryable,
                  chatId,
                  canContinue: event.retryable && chatId !== null,
                };
              }
              if (event.type === "done") truncated = event.truncated === true;
              if (event.type === "done" || event.type === "error") {
                ended = true;
                break;
              }
            }
          }
        } catch {
          // Reading failed: Stop, or the connection dropped.
        }

        const stopped = !ended && controller.signal.aborted;
        if (!ended && !stopped) {
          // The stream ended without saying how: the connection was lost.
          error = {
            code: "CONNECTION_LOST",
            retryable: true,
            chatId,
            canContinue: chatId !== null,
          };
        }
        if (ended && !controller.signal.aborted) controller.abort();
        finish({ stopped, error, truncated });
      })();

      return accepted;
    },
    [flushDraft, queryClient, resetDraft, workspaceId],
  );

  const start = useCallback(
    (content: string) => run({ kind: "start", content }),
    [run],
  );
  const send = useCallback(
    (chatId: string, content: string) => run({ kind: "send", chatId, content }),
    [run],
  );
  const continueTurn = useCallback(
    (chatId: string) => run({ kind: "continue", chatId }),
    [run],
  );
  const stop = useCallback(() => controllerRef.current?.abort(), []);
  const dismissError = useCallback(
    () => setState((current) => ({ ...current, error: null })),
    [],
  );

  return {
    ...state,
    isActive: state.phase !== "idle",
    start,
    send,
    continueTurn,
    stop,
    dismissError,
  };
}

export type AssistantTurn = ReturnType<typeof useAssistantTurn>;
