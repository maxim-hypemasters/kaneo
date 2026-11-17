import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { HolidayDeadlineField } from "./holiday-deadline-field";

const m = vi.hoisted(() => ({
  save: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
  }),
}));
vi.mock("@/hooks/mutations/time-off/use-set-time-off-settings", () => ({
  useSetTimeOffSettings: () => ({ mutateAsync: m.save, isPending: false }),
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-11-14",
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

function renderField(value: string | null) {
  render(
    <>
      <p id="hint">The rule</p>
      <HolidayDeadlineField workspaceId="w1" value={value} describedBy="hint" />
    </>,
  );
}

function openPicker(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByPlaceholderText("tasks:datePicker.datePlaceholder");
}

beforeEach(() => {
  m.save.mockReset().mockResolvedValue({});
  m.success.mockReset();
  m.error.mockReset();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("HolidayDeadlineField", () => {
  it("says when there is no deadline, with the rule as its description", () => {
    renderField(null);

    const button = screen.getByRole("button", {
      name: "settings:workspaceTimeOff.deadlineLabel settings:workspaceTimeOff.noDeadline",
    });
    expect(button).toHaveAccessibleDescription("The rule");
  });

  it("saves a picked day and says so", async () => {
    renderField(null);
    const input = openPicker(/settings:workspaceTimeOff\.noDeadline/);

    expect(
      screen.queryByRole("option", {
        name: /settings:workspaceTimeOff\.clearDeadline/,
      }),
    ).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "2026-12-01" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("option", { name: /Dec 1/ })),
    );

    expect(m.save).toHaveBeenCalledWith({
      holidayCalendarDeadline: "2026-12-01",
    });
    expect(m.success).toHaveBeenCalledWith(
      "settings:workspaceTimeOff.deadlineSaved|Dec 1",
    );
  });

  it("removes the deadline", async () => {
    renderField("2026-11-30");
    openPicker(/settings:workspaceTimeOff\.deadlineLabel Nov 30/);

    await act(async () =>
      fireEvent.click(
        screen.getByRole("option", {
          name: /settings:workspaceTimeOff\.clearDeadline/,
        }),
      ),
    );

    expect(m.save).toHaveBeenCalledWith({ holidayCalendarDeadline: null });
    expect(m.success).toHaveBeenCalledWith(
      "settings:workspaceTimeOff.deadlineCleared",
    );
  });

  it("keeps the server's message when saving fails", async () => {
    m.save.mockRejectedValue(new HttpError(402, "Workspace plan expired"));
    renderField("2026-11-30");
    openPicker(/Nov 30/);

    await act(async () =>
      fireEvent.click(
        screen.getByRole("option", {
          name: /settings:workspaceTimeOff\.clearDeadline/,
        }),
      ),
    );

    expect(m.error).toHaveBeenCalledWith("Workspace plan expired");
    expect(m.success).not.toHaveBeenCalled();
  });
});
