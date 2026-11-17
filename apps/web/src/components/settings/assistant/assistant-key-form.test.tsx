import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { AssistantSettings } from "@/fetchers/assistant/get-assistant-settings";
import { HttpError } from "@/lib/http-error";
import { AssistantKeyForm } from "./assistant-key-form";

const m = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/hooks/mutations/assistant/use-save-assistant-settings", () => ({
  useSaveAssistantSettings: () => ({ mutateAsync: m.save, isPending: false }),
}));
vi.mock("@/hooks/queries/assistant/use-assistant-models", () => ({
  useAssistantModels: () => ({
    data: [
      {
        id: "anthropic/claude-sonnet-5.5",
        name: "Anthropic: Claude Sonnet 5.5",
        contextLength: 200_000,
        promptPerMTokUsd: 3,
        completionPerMTokUsd: 15,
        recommended: true,
      },
      {
        id: "openai/gpt-6-mini",
        name: "OpenAI: GPT-6 Mini",
        contextLength: 400_000,
        promptPerMTokUsd: 0.25,
        completionPerMTokUsd: 2,
        recommended: false,
      },
    ],
    isPending: false,
    isError: false,
  }),
}));

const SONNET = "anthropic/claude-sonnet-5.5";
const NEW_KEY = "sk-or-v1-0123456789abcdefghij";

const savedSettings: AssistantSettings = {
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

const unconfiguredSettings: AssistantSettings = {
  ...savedSettings,
  configured: false,
  keyHint: null,
  keyState: null,
  updatedAt: null,
  updatedBy: null,
};

function renderForm(settings: AssistantSettings = savedSettings) {
  return render(<AssistantKeyForm workspaceId="ws1" settings={settings} />);
}

const keyInput = () =>
  screen.getByLabelText("settings:assistantPage.form.keyLabel");

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.save.mockImplementation(
    async (variables: { data: { allowDataCollection?: boolean } }) => ({
      ...savedSettings,
      allowDataCollection: variables.data.allowDataCollection ?? false,
    }),
  );
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

describe("AssistantKeyForm", () => {
  it("never prefills the saved key and only shows its hint", () => {
    renderForm();

    const input = keyInput();
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(
      screen.getByText(/settings:assistantPage\.form\.keyHintSaved/),
    ).toHaveTextContent("…a1b2");
    expect(
      screen.getByLabelText("settings:assistantPage.form.modelLabel"),
    ).toHaveValue(SONNET);
    const getKey = screen.getByRole("link", {
      name: /settings:assistantPage\.form\.getKey/,
    });
    expect(getKey).toHaveAttribute("href", "https://openrouter.ai/keys");
    expect(getKey).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps the saved key when the field is left blank", async () => {
    renderForm();

    fireEvent.click(
      screen.getByRole("button", { name: "settings:assistantPage.form.save" }),
    );

    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    const [variables] = m.save.mock.calls[0] ?? [];
    expect(variables).toEqual({
      workspaceId: "ws1",
      data: { model: SONNET, allowDataCollection: false },
    });
    expect(variables.data).not.toHaveProperty("apiKey");
  });

  it("sends a new key once and clears the field after saving", async () => {
    renderForm();

    fireEvent.change(keyInput(), { target: { value: `  ${NEW_KEY}  ` } });
    fireEvent.click(
      screen.getByRole("switch", {
        name: "settings:assistantPage.privacy.label",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings:assistantPage.form.save" }),
    );

    await waitFor(() =>
      expect(m.save).toHaveBeenCalledWith({
        workspaceId: "ws1",
        data: { apiKey: NEW_KEY, model: SONNET, allowDataCollection: true },
      }),
    );
    await waitFor(() => expect(keyInput()).toHaveValue(""));
  });

  it("picks a listed model or saves a typed id", async () => {
    renderForm();
    const modelInput = screen.getByLabelText(
      "settings:assistantPage.form.modelLabel",
    );

    fireEvent.keyDown(modelInput, { key: "ArrowDown" });
    expect(
      await screen.findByText("settings:assistantPage.form.recommended"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:assistantPage.form.allModels"),
    ).toBeInTheDocument();
    const gpt = screen.getByRole("option", { name: /OpenAI: GPT-6 Mini/ });
    expect(gpt).toHaveTextContent('"input":"$0.25","output":"$2.00"');
    fireEvent.click(gpt, { detail: 1 });
    await waitFor(() => expect(modelInput).toHaveValue("openai/gpt-6-mini"));

    fireEvent.change(modelInput, { target: { value: "acme/custom-model" } });
    fireEvent.click(
      screen.getByRole("button", { name: "settings:assistantPage.form.save" }),
    );

    await waitFor(() =>
      expect(m.save).toHaveBeenCalledWith({
        workspaceId: "ws1",
        data: { model: "acme/custom-model", allowDataCollection: false },
      }),
    );
  });

  it("asks for a key before the first save", () => {
    renderForm(unconfiguredSettings);

    const connect = screen.getByRole("button", {
      name: "settings:assistantPage.form.connect",
    });
    expect(connect).toBeDisabled();
    expect(
      screen.getByText("settings:assistantPage.form.keyHintRequired"),
    ).toBeInTheDocument();

    fireEvent.change(keyInput(), { target: { value: NEW_KEY } });
    expect(connect).toBeEnabled();
  });

  it("asks for the key again when it can no longer be read", () => {
    renderForm({ ...savedSettings, keyState: "unreadable" });

    expect(
      screen.getByRole("button", { name: "settings:assistantPage.form.save" }),
    ).toBeDisabled();
    expect(
      screen.getByText("settings:assistantPage.form.keyHintUnreadable"),
    ).toBeInTheDocument();
  });

  it("shows a rejected key next to the field and keeps what was typed", async () => {
    m.save.mockRejectedValue(
      new HttpError(400, "OpenRouter rejected the key", {
        code: "OPENROUTER_KEY_INVALID",
      }),
    );
    renderForm();

    fireEvent.change(keyInput(), { target: { value: NEW_KEY } });
    fireEvent.click(
      screen.getByRole("button", { name: "settings:assistantPage.form.save" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "settings:assistantPage.errors.keyInvalid",
    );
    expect(keyInput()).toHaveAttribute("aria-invalid", "true");
    expect(keyInput()).toHaveValue(NEW_KEY);
    expect(screen.queryByText("OpenRouter rejected the key")).toBeNull();
  });

  it("reports an unreachable OpenRouter for the whole form", async () => {
    m.save.mockRejectedValue(
      new HttpError(502, "upstream", { code: "OPENROUTER_UNREACHABLE" }),
    );
    renderForm();

    fireEvent.click(
      screen.getByRole("button", { name: "settings:assistantPage.form.save" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "settings:assistantPage.errors.unreachable",
    );
    expect(keyInput()).not.toHaveAttribute("aria-invalid");
  });
});
