import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { Route } from "./index";

const m = vi.hoisted(() => ({
  search: {} as { chat?: string },
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ workspaceId: "workspace-1" }),
    useSearch: () => m.search,
    useNavigate: () => m.navigate,
  }),
}));
vi.mock("@/components/assistant/panel/assistant-panel", () => ({
  AssistantPanel: ({
    workspaceId,
    chatId,
    onSelectChat,
  }: {
    workspaceId: string;
    chatId: string | null;
    onSelectChat: (chatId: string | null, options?: object) => void;
  }) => (
    <section aria-label="assistant" data-workspace={workspaceId}>
      <span>{`chat:${chatId ?? "new"}`}</span>
      <button type="button" onClick={() => onSelectChat("chat-2")}>
        open chat-2
      </button>
      <button
        type="button"
        onClick={() => onSelectChat(null, { replace: true })}
      >
        new chat
      </button>
    </section>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("@/components/billing/trial-expired-callout", () => ({
  TrialExpiredCallout: () => null,
}));
vi.mock("@/components/common/workspace-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/home/activity-feed", () => ({
  ActivityFeed: () => null,
}));
vi.mock("@/components/home/home-projects", () => ({
  HomeProjects: () => null,
}));
vi.mock("@/components/home/up-next", () => ({ UpNext: () => null }));
vi.mock("@/components/home/week-strip", () => ({ WeekStrip: () => null }));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/shared/modals/create-project-modal", () => ({
  default: () => null,
}));
vi.mock("@/hooks/queries/task/use-get-assigned-tasks", () => ({
  default: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/use-local-day", () => ({
  useLocalDay: () => "2026-10-16",
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateWorkItems: () => true,
    canCreateProjects: () => true,
  }),
}));

const routeOptions = (
  Route as unknown as {
    options: {
      component: ComponentType;
      validateSearch: (search: Record<string, unknown>) => unknown;
    };
  }
).options;
const Home = routeOptions.component;

beforeEach(() => {
  m.search = {};
  m.navigate.mockReset();
});

afterEach(cleanup);

describe("workspace home", () => {
  it("offers no New menu, even to members who can create work", () => {
    render(<Home />);

    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeNull();
  });
});

describe("workspace home assistant", () => {
  it("reads the open chat from a validated search param", () => {
    expect(routeOptions.validateSearch({ chat: "chat-1" })).toEqual({
      chat: "chat-1",
    });
    expect(routeOptions.validateSearch({ chat: "../x" })).toEqual({});
  });

  it("shows the assistant for the open chat, or a new one", () => {
    render(<Home />);
    const panel = screen.getByRole("region", { name: "assistant" });
    expect(panel).toHaveAttribute("data-workspace", "workspace-1");
    expect(panel).toHaveTextContent("chat:new");
    cleanup();

    m.search = { chat: "chat-1" };
    render(<Home />);
    expect(screen.getByText("chat:chat-1")).toBeInTheDocument();
  });

  it("puts the selected chat in the URL", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "open chat-2" }));
    expect(m.navigate).toHaveBeenLastCalledWith({
      search: { chat: "chat-2" },
      replace: undefined,
    });

    fireEvent.click(screen.getByRole("button", { name: "new chat" }));
    expect(m.navigate).toHaveBeenLastCalledWith({ search: {}, replace: true });
  });
});
