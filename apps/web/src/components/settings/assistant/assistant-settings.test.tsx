import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { AssistantKeyUsage } from "@/fetchers/assistant/get-assistant-key-usage";
import type { AssistantSettings as Settings } from "@/fetchers/assistant/get-assistant-settings";
import { AssistantSettings } from "./assistant-settings";

const SONNET = "anthropic/claude-sonnet-5.5";

const okSettings: Settings = {
  configured: true,
  keyHint: "…a1b2",
  keyState: "ok",
  model: SONNET,
  defaultModel: SONNET,
  allowDataCollection: false,
  lastError: null,
  updatedAt: "2026-11-16T10:00:00.000Z",
  updatedBy: { id: "u1", name: "Ada" },
};

const m = vi.hoisted(() => ({
  canManage: true,
  hasAssistant: true,
  settings: undefined as Settings | undefined,
  usage: undefined as AssistantKeyUsage | undefined,
  settingsOptions: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("@/lib/format", () => ({ formatDateMedium: () => "Nov 16, 2026" }));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws1", name: "Acme" } }),
}));
vi.mock("@/hooks/queries/config/use-get-config", () => ({
  default: () => ({ data: { hasAssistant: m.hasAssistant } }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canManageSettings: () => m.canManage,
    isCheckingPermissions: false,
  }),
}));
vi.mock("@/hooks/queries/assistant/use-assistant-settings", () => ({
  useAssistantSettings: (workspaceId: string, options: unknown) => {
    m.settingsOptions(workspaceId, options);
    return {
      data: m.settings,
      isPending: m.settings === undefined,
      isError: false,
    };
  },
}));
vi.mock("@/hooks/queries/assistant/use-assistant-key-usage", () => ({
  useAssistantKeyUsage: () => ({
    data: m.usage,
    isPending: m.usage === undefined,
    isError: false,
  }),
}));
vi.mock("@/hooks/queries/assistant/use-assistant-models", () => ({
  useAssistantModels: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/mutations/assistant/use-save-assistant-settings", () => ({
  useSaveAssistantSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/mutations/assistant/use-remove-assistant-settings", () => ({
  useRemoveAssistantSettings: () => ({
    mutateAsync: m.remove,
    isPending: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.canManage = true;
  m.hasAssistant = true;
  m.settings = okSettings;
  m.usage = {
    usageUsd: 1.5,
    limitUsd: 10,
    limitRemainingUsd: 8.5,
    isFreeTier: false,
  };
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe("AssistantSettings", () => {
  it("shows members an explanation instead of the settings", () => {
    m.canManage = false;
    render(<AssistantSettings />);

    expect(
      screen.getByText("settings:assistantPage.membersTitle"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("settings:assistantPage.form.keyLabel"),
    ).toBeNull();
    expect(m.settingsOptions).toHaveBeenCalledWith("ws1", { enabled: false });
  });

  it("explains when the instance turned the assistant off", () => {
    m.hasAssistant = false;
    render(<AssistantSettings />);

    expect(
      screen.getByText("settings:assistantPage.disabledTitle"),
    ).toBeInTheDocument();
    expect(m.settingsOptions).toHaveBeenCalledWith("ws1", { enabled: false });
  });

  it("shows skeletons while the settings load", () => {
    m.settings = undefined;
    render(<AssistantSettings />);

    expect(screen.getAllByTestId("settings-row-skeleton")).toHaveLength(3);
  });

  it("shows a connected key with its usage against the limit", () => {
    render(<AssistantSettings />);

    expect(
      screen.getByText("settings:assistantPage.status.connected"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/settings:assistantPage\.usage\.limited/),
    ).toHaveTextContent('"used":"$1.50","limit":"$10.00"');
  });

  it("warns when the key has no credit limit", () => {
    m.usage = {
      usageUsd: 2,
      limitUsd: null,
      limitRemainingUsd: null,
      isFreeTier: false,
    };
    render(<AssistantSettings />);

    expect(
      screen.getByText("settings:assistantPage.usage.noLimitWarning", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /settings:assistantPage\.usage\.setLimit/,
      }),
    ).toHaveAttribute("href", "https://openrouter.ai/settings/keys");
  });

  it("skips usage for a key OpenRouter rejected", () => {
    m.settings = { ...okSettings, keyState: "rejected" };
    render(<AssistantSettings />);

    expect(
      screen.getByText("settings:assistantPage.status.rejected"),
    ).toBeInTheDocument();
    expect(screen.queryByText("settings:assistantPage.usage.title")).toBeNull();
  });

  it("offers no removal before a key is saved", () => {
    m.settings = {
      ...okSettings,
      configured: false,
      keyHint: null,
      keyState: null,
    };
    render(<AssistantSettings />);

    expect(
      screen.getByText("settings:assistantPage.status.notConfigured"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "settings:assistantPage.remove.button",
      }),
    ).toBeNull();
  });

  it("removes the key only after confirmation", async () => {
    m.remove.mockResolvedValue({ ...okSettings, configured: false });
    render(<AssistantSettings />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:assistantPage.remove.button",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(m.remove).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "settings:assistantPage.remove.confirm",
      }),
    );

    await waitFor(() => expect(m.remove).toHaveBeenCalledWith("ws1"));
  });
});
