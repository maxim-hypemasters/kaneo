import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { AssistantSettings } from "@/fetchers/assistant/get-assistant-settings";
import saveAssistantSettings from "@/fetchers/assistant/save-assistant-settings";
import { HttpError } from "@/lib/http-error";
import { useSaveAssistantSettings } from "./use-save-assistant-settings";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/fetchers/assistant/save-assistant-settings", () => ({
  default: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const saved: AssistantSettings = {
  configured: true,
  keyHint: "…a1b2",
  keyState: "ok",
  model: "anthropic/claude-sonnet-5.5",
  defaultModel: "anthropic/claude-sonnet-5.5",
  allowDataCollection: false,
  lastError: null,
  updatedAt: "2026-11-16T10:00:00.000Z",
  updatedBy: { id: "u1", name: "Ada" },
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const invalidated = (queryKey: string[]) =>
  queryClient.getQueryState(queryKey)?.isInvalidated;

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  for (const queryKey of [
    ["assistant", "status", "ws1"],
    ["assistant", "usage", "ws1"],
    ["assistant", "status", "ws2"],
  ])
    queryClient.setQueryData(queryKey, {});
});
afterEach(() => queryClient.clear());

it("stores the saved settings and refreshes status and usage", async () => {
  vi.mocked(saveAssistantSettings).mockResolvedValue(saved);
  const { result } = renderHook(() => useSaveAssistantSettings(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      workspaceId: "ws1",
      data: { model: saved.model },
    });
  });

  expect(saveAssistantSettings).toHaveBeenCalledWith("ws1", {
    model: saved.model,
  });
  expect(queryClient.getQueryData(["assistant", "settings", "ws1"])).toEqual(
    saved,
  );
  expect(invalidated(["assistant", "status", "ws1"])).toBe(true);
  expect(invalidated(["assistant", "settings", "ws1"])).toBe(true);
  expect(invalidated(["assistant", "usage", "ws1"])).toBe(true);
  expect(invalidated(["assistant", "status", "ws2"])).toBe(false);
  expect(toast.success).toHaveBeenCalledWith(
    "settings:assistantPage.toast.saved",
    { icon: expect.anything() },
  );
});

it("warns when the model could not be checked and keeps that flag out of the cache", async () => {
  vi.mocked(saveAssistantSettings).mockResolvedValue({
    ...saved,
    modelUnverified: true,
  });
  const { result } = renderHook(() => useSaveAssistantSettings(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      workspaceId: "ws1",
      data: { model: saved.model },
    });
  });

  expect(toast.warning).toHaveBeenCalledWith(
    "settings:assistantPage.toast.savedUnverified",
    { icon: expect.anything() },
  );
  expect(toast.success).not.toHaveBeenCalled();
  expect(
    queryClient.getQueryData(["assistant", "settings", "ws1"]),
  ).not.toHaveProperty("modelUnverified");
});

it("leaves errors to the form", async () => {
  vi.mocked(saveAssistantSettings).mockRejectedValue(
    new HttpError(400, "bad key", { code: "OPENROUTER_KEY_INVALID" }),
  );
  const { result } = renderHook(() => useSaveAssistantSettings(), { wrapper });

  await act(async () => {
    await expect(
      result.current.mutateAsync({
        workspaceId: "ws1",
        data: { model: saved.model, apiKey: "sk-or-v1-0123456789abcdef" },
      }),
    ).rejects.toThrow("bad key");
  });

  expect(toast.error).not.toHaveBeenCalled();
  expect(invalidated(["assistant", "status", "ws1"])).toBe(false);
});
