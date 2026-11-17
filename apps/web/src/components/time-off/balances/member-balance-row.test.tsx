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
import type { TimeOffBalance } from "@/fetchers/time-off/types";
import { MemberBalanceRow } from "./member-balance-row";

const m = vi.hoisted(() => ({
  setOverride: vi.fn(),
  clearOverride: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));
vi.mock(
  "@/hooks/mutations/time-off/use-set-time-off-allowance-override",
  () => ({
    useSetTimeOffAllowanceOverride: () => ({
      mutateAsync: m.setOverride,
      isPending: false,
    }),
  }),
);
vi.mock(
  "@/hooks/mutations/time-off/use-clear-time-off-allowance-override",
  () => ({
    useClearTimeOffAllowanceOverride: () => ({
      mutateAsync: m.clearOverride,
      isPending: false,
    }),
  }),
);
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

type Figures = TimeOffBalance["types"]["vacation"];

// Other types hold different figures, so a row shows only its own type.
const OTHER_TYPE: Figures = {
  allowanceDays: 10,
  allowanceSource: "default",
  usedDays: 1,
  pendingDays: 0,
  remainingDays: 9,
};

function balance(overrides: Partial<Figures> = {}): TimeOffBalance {
  return {
    workspaceId: "w1",
    userId: "ana",
    year: 2026,
    types: {
      vacation: OTHER_TYPE,
      sick: {
        allowanceDays: 25,
        allowanceSource: "default",
        usedDays: 12,
        pendingDays: 3,
        remainingDays: 13,
        ...overrides,
      },
      public_holiday: OTHER_TYPE,
    },
  };
}

function renderRow(current = balance(), { isViewer = false } = {}) {
  render(
    <table>
      <tbody>
        <MemberBalanceRow
          workspaceId="w1"
          balance={current}
          type="sick"
          member={{ userId: current.userId, name: "Ana Lee", image: null }}
          isViewer={isViewer}
          defaultAllowanceDays={25}
        />
      </tbody>
    </table>,
  );
}

const allowanceField = () =>
  screen.getByRole("textbox", {
    name: "team:timeOff.balances.overrideLabel|team:timeOff.types.sick|Ana Lee",
  });

async function typeAndBlur(value: string) {
  const field = allowanceField();
  fireEvent.change(field, { target: { value } });
  await act(async () => {
    fireEvent.blur(field);
  });
}

beforeEach(() => {
  m.setOverride.mockReset().mockResolvedValue({});
  m.clearOverride.mockReset().mockResolvedValue({});
  m.success.mockReset();
  m.error.mockReset();
});

afterEach(() => cleanup());

describe("MemberBalanceRow", () => {
  it("shows the default as a placeholder and the year's day counts", () => {
    renderRow();

    expect(allowanceField()).toHaveValue("");
    expect(allowanceField()).toHaveAttribute(
      "placeholder",
      "team:timeOff.balances.defaultPlaceholder|25",
    );
    expect(screen.getByText("team:timeOff.days|12")).toBeInTheDocument();
    expect(screen.getByText("team:timeOff.days|3")).toBeInTheDocument();
    expect(screen.getByText("team:timeOff.days|13")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /useDefaultFor/ }),
    ).not.toBeInTheDocument();
  });

  it("marks the viewer and days over the allowance", () => {
    renderRow(balance({ usedDays: 28, remainingDays: -3 }), {
      isViewer: true,
    });

    expect(screen.getByText("team:timeOff.you")).toBeInTheDocument();
    expect(screen.getByText("team:timeOff.balance.over|3")).toBeInTheDocument();
  });

  it("sets an override when a number is typed and the field is left", async () => {
    renderRow();

    await typeAndBlur("30");

    expect(m.setOverride).toHaveBeenCalledWith({
      userId: "ana",
      type: "sick",
      days: 30,
    });
    expect(m.clearOverride).not.toHaveBeenCalled();
    expect(m.success).toHaveBeenCalledWith(
      "team:timeOff.balances.overrideSaved|team:timeOff.types.sick|Ana Lee",
    );
  });

  it("saves on Enter", async () => {
    renderRow();
    const field = allowanceField();

    fireEvent.change(field, { target: { value: "20" } });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });

    expect(m.setOverride).toHaveBeenCalledWith({
      userId: "ana",
      type: "sick",
      days: 20,
    });
  });

  it("puts the saved value back on Escape", async () => {
    renderRow(balance({ allowanceSource: "override", allowanceDays: 30 }));
    const field = allowanceField();

    fireEvent.change(field, { target: { value: "12" } });
    fireEvent.keyDown(field, { key: "Escape" });
    await act(async () => {
      fireEvent.blur(field);
    });

    expect(field).toHaveValue("30");
    expect(m.setOverride).not.toHaveBeenCalled();
  });

  it("rejects a value outside 0 to 366 without saving", async () => {
    renderRow();

    await typeAndBlur("400");

    expect(m.setOverride).not.toHaveBeenCalled();
    expect(allowanceField()).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("team:timeOff.balances.invalid"),
    ).toBeInTheDocument();
  });

  it("clears the override with Use default", async () => {
    renderRow(balance({ allowanceSource: "override", allowanceDays: 30 }));

    expect(allowanceField()).toHaveValue("30");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "team:timeOff.balances.useDefaultFor|team:timeOff.types.sick|Ana Lee",
        }),
      );
    });

    expect(m.clearOverride).toHaveBeenCalledWith({
      userId: "ana",
      type: "sick",
    });
    expect(m.setOverride).not.toHaveBeenCalled();
    expect(m.success).toHaveBeenCalledWith(
      "team:timeOff.balances.overrideCleared|team:timeOff.types.sick|Ana Lee",
    );
    // The button is about to go, so the allowance field takes focus.
    expect(allowanceField()).toHaveFocus();
  });

  it("keeps focus on Use default when clearing fails", async () => {
    m.clearOverride.mockRejectedValue(new Error("Missing permission"));
    renderRow(balance({ allowanceSource: "override", allowanceDays: 30 }));
    const button = screen.getByRole("button", {
      name: "team:timeOff.balances.useDefaultFor|team:timeOff.types.sick|Ana Lee",
    });
    button.focus();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(m.error).toHaveBeenCalledWith("Missing permission");
    expect(button).toHaveFocus();
  });

  it("clears the override when the field is emptied", async () => {
    renderRow(balance({ allowanceSource: "override", allowanceDays: 30 }));

    await typeAndBlur("");

    expect(m.clearOverride).toHaveBeenCalledWith({
      userId: "ana",
      type: "sick",
    });
  });

  it("shows the server's message when saving fails", async () => {
    m.setOverride.mockRejectedValue(new Error("Missing permission"));
    renderRow();

    await typeAndBlur("30");

    expect(m.error).toHaveBeenCalledWith("Missing permission");
    expect(m.success).not.toHaveBeenCalled();
  });
});
