import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { AssistantPanel } from "./assistant-panel";

type Status = {
  enabled: boolean;
  reason: string | null;
  model: string | null;
  canManage: boolean;
};

const m = vi.hoisted(() => ({
  hasAssistant: true as boolean,
  status: undefined as Status | undefined,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/config/use-get-config", () => ({
  default: () => ({ data: { hasAssistant: m.hasAssistant } }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws1", slug: "acme" } }),
}));
vi.mock("@/hooks/queries/assistant/use-assistant-status", () => ({
  useAssistantStatus: () => ({ data: m.status }),
}));
vi.mock("./assistant-chat-card", () => ({
  AssistantChatCard: ({
    warning,
    model,
    workspaceSlug,
  }: {
    warning: string | null;
    model: string | null;
    workspaceSlug?: string;
  }) => (
    <div data-testid="chat-card">{`${model}|${warning}|${workspaceSlug}`}</div>
  ),
}));

const ready: Status = {
  enabled: true,
  reason: null,
  model: "anthropic/claude-sonnet-5.5",
  canManage: false,
};

const renderPanel = () =>
  render(
    <AssistantPanel workspaceId="ws1" chatId={null} onSelectChat={vi.fn()} />,
  );

beforeEach(() => {
  m.hasAssistant = true;
  m.status = ready;
  localStorage.clear();
});
afterEach(cleanup);

describe("AssistantPanel", () => {
  it("shows the chat to members once a key is connected", () => {
    const { container } = renderPanel();
    expect(container).toHaveTextContent(
      "anthropic/claude-sonnet-5.5|null|acme",
    );
  });

  it("passes a key warning on to the chat", () => {
    m.status = { ...ready, reason: "out_of_credits" };
    renderPanel();
    expect(screen.getByTestId("chat-card")).toHaveTextContent(
      "|out_of_credits|",
    );
  });

  it("shows nothing while unknown, when turned off, or to members without a key", () => {
    for (const setup of [
      () => {
        m.status = undefined;
      },
      () => {
        m.hasAssistant = false;
      },
      () => {
        m.status = {
          enabled: false,
          reason: "not_configured",
          model: null,
          canManage: false,
        };
      },
    ]) {
      m.hasAssistant = true;
      m.status = ready;
      setup();
      const { container } = renderPanel();
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });

  it("invites admins to set it up until they choose Not now", () => {
    m.status = {
      enabled: false,
      reason: "not_configured",
      model: null,
      canManage: true,
    };
    renderPanel();
    expect(
      screen.getByRole("link", { name: "workspace:assistant.setup.action" }),
    ).toHaveAttribute("href", "/dashboard/settings/workspace/assistant");

    fireEvent.click(
      screen.getByRole("button", { name: "workspace:assistant.setup.dismiss" }),
    );
    expect(
      screen.queryByText("workspace:assistant.setup.title"),
    ).not.toBeInTheDocument();
    cleanup();

    // Remembered for this workspace.
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("asks admins to enter an unreadable key again", () => {
    m.status = {
      enabled: false,
      reason: "key_unreadable",
      model: null,
      canManage: true,
    };
    renderPanel();
    expect(
      screen.getByText("workspace:assistant.setup.unreadableTitle"),
    ).toBeInTheDocument();
  });
});
