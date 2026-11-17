import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import decideAssistantActions, {
  type AssistantDecisionsResult,
} from "@/fetchers/assistant/decide-assistant-actions";
import { useDecideAssistantActions } from "./use-decide-assistant-actions";
import { useDecisionsInFlight } from "./use-decisions-in-flight";

vi.mock("@/fetchers/assistant/decide-assistant-actions", () => ({
  default: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
});
afterEach(() => queryClient.clear());

it("sees a decision on its way after the view that made it unmounted", async () => {
  let answer: (result: AssistantDecisionsResult) => void = () => undefined;
  vi.mocked(decideAssistantActions).mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  const variables = {
    chatId: "c1",
    decisions: [{ messageId: "t1", approve: true }],
  };
  const deciding = renderHook(() => useDecideAssistantActions("ws1"), {
    wrapper,
  });
  act(() => deciding.result.current.mutate(variables));
  deciding.unmount();

  const reopened = renderHook(() => useDecisionsInFlight("ws1"), { wrapper });
  const otherWorkspace = renderHook(() => useDecisionsInFlight("ws2"), {
    wrapper,
  });
  expect(reopened.result.current).toEqual([variables]);
  expect(otherWorkspace.result.current).toEqual([]);

  act(() => answer({ messages: [], pendingCount: 0, resumable: false }));
  await waitFor(() => expect(reopened.result.current).toEqual([]));
});
