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
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { HttpError } from "@/lib/http-error";
import { TimeOffRequestForm } from "./time-off-request-form";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  balanceYears: vi.fn(),
  balances: [] as unknown[],
  holidayYears: vi.fn(),
  holidays: new Set<string>(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/hooks/mutations/time-off/use-create-time-off-request", () => ({
  useCreateTimeOffRequest: () => ({ mutateAsync: m.create, isPending: false }),
}));
vi.mock("@/hooks/mutations/time-off/use-update-time-off-request", () => ({
  useUpdateTimeOffRequest: () => ({ mutateAsync: m.update, isPending: false }),
}));
vi.mock("@/hooks/queries/time-off/use-time-off-balance-years", () => ({
  useTimeOffBalanceYears: (...args: unknown[]) => {
    m.balanceYears(...args);
    return { balances: m.balances, isPending: false, isError: false };
  },
}));
vi.mock("@/hooks/queries/time-off/use-member-holiday-years", () => ({
  useMemberHolidayYears: (...args: unknown[]) => {
    m.holidayYears(...args);
    return { days: m.holidays, isPending: false, isError: false };
  },
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({ data: { members: [] } }),
  }),
);
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const request: TimeOffRequest = {
  id: "t1",
  workspaceId: "w1",
  userId: "me",
  type: "vacation",
  status: "pending",
  startDate: "2026-11-16",
  endDate: "2026-11-20",
  days: 5,
  daysByYear: [{ year: 2026, days: 5 }],
  note: null,
  version: 2,
  createdBy: "me",
  statusChangedBy: null,
  statusChangedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  canEdit: true,
  canCancel: true,
  canDecide: false,
};

function figures(allowanceDays: number, usedDays = 0, pendingDays = 0) {
  return {
    allowanceDays,
    allowanceSource: "default",
    usedDays,
    pendingDays,
    remainingDays: allowanceDays - usedDays,
  };
}

function balance(usedDays: number, pendingDays: number, sick = figures(10)) {
  return {
    workspaceId: "w1",
    userId: "me",
    year: 2026,
    types: {
      vacation: figures(25, usedDays, pendingDays),
      sick,
      public_holiday: figures(10),
    },
  };
}

function renderForm(current: TimeOffRequest | null) {
  const onClose = vi.fn();
  render(
    <Dialog open>
      <DialogPopup>
        <TimeOffRequestForm
          workspaceId="w1"
          request={current}
          viewerId="me"
          canRequest
          canApprove={false}
          today="2026-11-14"
          onClose={onClose}
          onBusyChange={() => {}}
        />
      </DialogPopup>
    </Dialog>,
  );
  return { onClose };
}

async function submit(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: label }));
  });
}

beforeEach(() => {
  m.create.mockReset().mockResolvedValue({});
  m.update.mockReset().mockResolvedValue({ request });
  m.success.mockReset();
  m.error.mockReset();
  m.balanceYears.mockReset();
  m.balances = [balance(10, 5)];
  m.holidayYears.mockReset();
  m.holidays = new Set();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("TimeOffRequestForm", () => {
  it("counts the working days and what is left, without counting an edit twice", () => {
    renderForm(request);

    expect(
      screen.getByText("team:timeOff.summary.weekdays|5"),
    ).toBeInTheDocument();
    // 25 allowance - 10 used - (5 pending - 5 this request) - 5 draft.
    expect(
      screen.getByText(
        "team:timeOff.summary.remaining|team:timeOff.types.vacation|2026|10",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(m.balanceYears).toHaveBeenCalledWith("w1", [2026], {
      userId: undefined,
      enabled: true,
    });
    expect(m.holidayYears).toHaveBeenCalledWith("w1", [2026], {
      userId: undefined,
      lang: "en-US",
      enabled: true,
    });
  });

  it("leaves the member's holidays out of the preview", () => {
    // Wednesday 2026-11-18 and a Saturday, which never counted.
    m.holidays = new Set(["2026-11-18", "2026-11-21"]);
    renderForm(request);

    expect(
      screen.getByText("team:timeOff.summary.weekdays|4"),
    ).toBeInTheDocument();
    // 25 - 10 used - (5 pending - 5 this request) - 4 draft.
    expect(
      screen.getByText(
        "team:timeOff.summary.remaining|team:timeOff.types.vacation|2026|11",
      ),
    ).toBeInTheDocument();
  });

  it("projects a request against its own type's allowance", () => {
    m.balances = [balance(10, 0, figures(10, 2, 5))];
    renderForm({ ...request, type: "sick" });

    // 10 sick allowance - 2 used - (5 pending - 5 this request) - 5 draft.
    expect(
      screen.getByText(
        "team:timeOff.summary.remaining|team:timeOff.types.sick|2026|3",
      ),
    ).toBeInTheDocument();
  });

  it("warns when over the allowance and still lets you send", async () => {
    m.balances = [balance(23, 5)];
    const { onClose } = renderForm(request);

    const warning = screen.getByRole("status");
    expect(warning).toHaveAttribute("aria-live", "polite");
    expect(warning).toHaveTextContent("team:timeOff.summary.overTitle");
    expect(
      screen.getByText(
        "team:timeOff.summary.over|team:timeOff.types.vacation|2026|3",
      ),
    ).toBeInTheDocument();

    const save = screen.getByRole("button", {
      name: "team:timeOff.dialog.save",
    });
    expect(save).toBeEnabled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "team:timeOff.dialog.noteLabel" }),
      { target: { value: "Family trip" } },
    );
    await submit("team:timeOff.dialog.save");

    expect(m.update).toHaveBeenCalledWith({
      id: "t1",
      data: { note: "Family trip" },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("asks for both days before creating", async () => {
    renderForm(null);

    expect(
      screen.getByText("team:timeOff.summary.pickDates"),
    ).toBeInTheDocument();
    await submit("team:timeOff.dialog.submit");

    expect(m.create).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("team:timeOff.validation.dateRequired"),
    ).toHaveLength(2);
  });

  it("explains an overlap from the API and keeps the dialog open", async () => {
    m.update.mockRejectedValueOnce(
      new HttpError(409, "Overlaps another request for these days", {
        code: "TIME_OFF_OVERLAP",
      }),
    );
    const { onClose } = renderForm(request);
    fireEvent.change(
      screen.getByRole("textbox", { name: "team:timeOff.dialog.noteLabel" }),
      { target: { value: "Moved" } },
    );
    await submit("team:timeOff.dialog.save");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "team:timeOff.errors.overlap",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(m.error).not.toHaveBeenCalled();
  });
});
