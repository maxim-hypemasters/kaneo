import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import getAssistantKeyUsage from "@/fetchers/assistant/get-assistant-key-usage";
import { HttpError } from "@/lib/http-error";
import { assistantKeys } from "./assistant-keys";

// Asks OpenRouter through the API, which caches the answer for 60 seconds.
// A failure only hides the usage line, so it is not retried. When OpenRouter
// rejects the key the API records it, so the settings and status are refreshed.
export function useAssistantKeyUsage(
  workspaceId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: assistantKeys.usage(workspaceId ?? ""),
    queryFn: () => getAssistantKeyUsage(workspaceId ?? ""),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });
  const keyRejected = isKeyRejected(query.error);

  useEffect(() => {
    if (!keyRejected || !workspaceId) return;
    void queryClient.invalidateQueries({
      queryKey: assistantKeys.settings(workspaceId),
    });
    void queryClient.invalidateQueries({
      queryKey: assistantKeys.status(workspaceId),
    });
  }, [keyRejected, queryClient, workspaceId]);

  return { ...query, keyRejected };
}

function isKeyRejected(error: unknown) {
  return error instanceof HttpError && error.code === "OPENROUTER_KEY_INVALID";
}
