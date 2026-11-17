import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { AssistantSettings } from "@/fetchers/assistant/get-assistant-settings";
import removeAssistantSettings from "@/fetchers/assistant/remove-assistant-settings";
import { useRemoveAssistantSettings } from "./use-remove-assistant-settings";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/fetchers/assistant/remove-assistant-settings", () => ({
  default: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const removed: AssistantSettings = {
  configured: false,
  keyHint: null,
  keyState: null,
  model: "anthropic/claude-sonnet-5.5",
  defaultModel: "anthropic/claude-sonnet-5.5",
  allowDataCollection: false,
  lastError: null,
  updatedAt: null,
  updatedBy: null,
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  queryClient.setQueryData(["assistant", "status", "ws1"], {});
  queryClient.setQueryData(["assistant", "usage", "ws1"], { usageUsd: 1 });
});
afterEach(() => queryClient.clear());

it("turns the assistant off, drops the key's usage and refreshes status", async () => {
  vi.mocked(removeAssistantSettings).mockResolvedValue(removed);
  const { result } = renderHook(() => useRemoveAssistantSettings(), {
    wrapper,
  });

  await act(async () => {
    await result.current.mutateAsync("ws1");
  });

  expect(removeAssistantSettings).toHaveBeenCalledWith("ws1");
  expect(queryClient.getQueryData(["assistant", "settings", "ws1"])).toEqual(
    removed,
  );
  expect(queryClient.getQueryState(["assistant", "usage", "ws1"])).toBe(
    undefined,
  );
  expect(
    queryClient.getQueryState(["assistant", "status", "ws1"])?.isInvalidated,
  ).toBe(true);
  expect(toast.success).toHaveBeenCalledWith(
    "settings:assistantPage.toast.removed",
    { icon: expect.anything() },
  );
});

it("toasts a failed removal", async () => {
  vi.mocked(removeAssistantSettings).mockRejectedValue(new Error("nope"));
  const { result } = renderHook(() => useRemoveAssistantSettings(), {
    wrapper,
  });

  await act(async () => {
    await expect(result.current.mutateAsync("ws1")).rejects.toThrow("nope");
  });

  expect(toast.error).toHaveBeenCalledWith(
    "settings:assistantPage.toast.removeFailed",
  );
});
