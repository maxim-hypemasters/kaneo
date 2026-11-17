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
import type { PendingTimeOffRequest } from "@/fetchers/time-off/types";
import { HttpError } from "@/lib/http-error";
import { TimeOffApprovalRow } from "./time-off-approval-row";

const m = vi.hoisted(() => ({
  approve: vi.fn(),
  decline: vi.fn(),
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
vi.mock("@/hooks/mutations/time-off/use-approve-time-off-request", () => ({
  useApproveTimeOffRequest: () => ({
    mutateAsync: m.approve,
    isPending: false,
  }),
}));
vi.mock("@/hooks/mutations/time-off/use-decline-time-off-request", () => ({
  useDeclineTimeOffRequest: () => ({
    mutateAsync: m.decline,
    isPending: false,
  }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

function pendingRequest(
  overrides: Partial<PendingTimeOffRequest> = {},
): PendingTimeOffRequest {
  return {
    id: "t1",
    workspaceId: "w1",
    userId: "ana",
    type: "vacation",
    status: "pending",
    startDate: "2026-12-28",
    endDate: "2027-01-08",
    days: 10,
    daysByYear: [
      { year: 2026, days: 4 },
      { year: 2027, days: 6 },
    ],
    note: "Family trip",
    version: 3,
    createdBy: "ana",
    statusChangedBy: null,
    statusChangedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    canEdit: true,
    canCancel: true,
    canDecide: true,
    balances: [],
    overAllowanceDays: [
      { year: 2026, days: 0 },
      { year: 2027, days: 2 },
    ],
    ...overrides,
  };
}

function renderRow(
  request = pendingRequest(),
  { isViewer = false }: { isViewer?: boolean } = {},
) {
  render(
    <ul>
      <TimeOffApprovalRow
        workspaceId="w1"
        request={request}
        member={{ userId: request.userId, name: "Ana Lee", image: null }}
        isViewer={isViewer}
        today="2026-11-14"
      />
    </ul>,
  );
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  m.approve.mockReset().mockResolvedValue({});
  m.decline.mockReset().mockResolvedValue({});
  m.success.mockReset();
  m.error.mockReset();
});

afterEach(() => cleanup());

describe("TimeOffApprovalRow", () => {
  it("shows who, how many weekdays, the type and the note", () => {
    renderRow();

    expect(screen.getByText("Ana Lee")).toBeInTheDocument();
    expect(screen.getByText("team:timeOff.weekdays|10")).toBeInTheDocument();
    expect(screen.getByText("team:timeOff.types.vacation")).toBeInTheDocument();
    expect(screen.getByText("Family trip")).toBeInTheDocument();
    expect(screen.queryByText("team:timeOff.you")).not.toBeInTheDocument();
  });

  it("marks the viewer's own request", () => {
    renderRow(pendingRequest({ userId: "me" }), { isViewer: true });

    expect(screen.getByText("team:timeOff.you")).toBeInTheDocument();
  });

  it("warns only for the years the server says go over the allowance", () => {
    renderRow();

    expect(
      screen.getByText("team:timeOff.approvals.overAllowance|2|2027"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/team:timeOff\.approvals\.overAllowance\|\d+\|2026/),
    ).not.toBeInTheDocument();
  });

  it("shows no warning when the request fits the allowance", () => {
    renderRow(pendingRequest({ overAllowanceDays: [{ year: 2026, days: 0 }] }));

    expect(
      screen.queryByText(/team:timeOff\.approvals\.overAllowance/),
    ).not.toBeInTheDocument();
  });

  it("approves with the version on screen", async () => {
    renderRow();

    await click(/team:timeOff\.approvals\.approveFor\|Ana Lee/);

    expect(m.approve).toHaveBeenCalledWith({ id: "t1", version: 3 });
    expect(m.decline).not.toHaveBeenCalled();
    expect(m.success).toHaveBeenCalledWith(
      "team:timeOff.approvals.approved|Ana Lee",
    );
  });

  it("declines with the version on screen", async () => {
    renderRow(pendingRequest({ version: 7 }));

    await click(/team:timeOff\.approvals\.declineFor\|Ana Lee/);

    expect(m.decline).toHaveBeenCalledWith({ id: "t1", version: 7 });
    expect(m.approve).not.toHaveBeenCalled();
    expect(m.success).toHaveBeenCalledWith(
      "team:timeOff.approvals.declined|Ana Lee",
    );
  });

  it("asks to review again when the request changed in the meantime", async () => {
    m.approve.mockRejectedValue(
      new HttpError(409, "This request changed; review it again", {
        code: "TIME_OFF_CHANGED",
      }),
    );
    renderRow();

    await click(/team:timeOff\.approvals\.approveFor/);

    expect(m.error).toHaveBeenCalledWith("team:timeOff.approvals.changed");
    expect(m.success).not.toHaveBeenCalled();
  });

  it("says when someone else already decided the request", async () => {
    m.decline.mockRejectedValue(
      new HttpError(409, "This request was already approved", {
        code: "TIME_OFF_STATUS",
      }),
    );
    renderRow();

    await click(/team:timeOff\.approvals\.declineFor/);

    expect(m.error).toHaveBeenCalledWith(
      "team:timeOff.approvals.alreadyDecided",
    );
  });

  it("keeps the server's message for other errors", async () => {
    m.approve.mockRejectedValue(new HttpError(403, "Missing permission"));
    renderRow();

    await click(/team:timeOff\.approvals\.approveFor/);

    expect(m.error).toHaveBeenCalledWith("Missing permission");
  });

  it("offers no decision when the server doesn't allow one", () => {
    renderRow(pendingRequest({ canDecide: false }));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
