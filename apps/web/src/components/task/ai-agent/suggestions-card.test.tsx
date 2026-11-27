import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createRef } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { AgentSuggestion } from "@/fetchers/agent/get-task-agent";
import applyTaskAgentSuggestion from "@/fetchers/agent/apply-task-agent-suggestion";
import dismissTaskAgentSuggestion from "@/fetchers/agent/dismiss-task-agent-suggestion";
import { i18n, preloadNamespaces } from "@/lib/i18n";
import type { SuggestionPermissions } from "./can-apply-suggestion";
import {
  assigneeSuggestion,
  descriptionSuggestion,
  estimateSuggestion,
  featureSuggestion,
  milestoneSuggestion,
  prioritySuggestion,
  releaseSuggestion,
  testCasesSuggestion,
} from "./suggestion-fixtures";
import { SuggestionsCard } from "./suggestions-card";

vi.mock("@/fetchers/agent/apply-task-agent-suggestion", () => ({
  default: vi.fn(),
}));
vi.mock("@/fetchers/agent/dismiss-task-agent-suggestion", () => ({
  default: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The real en-US copy: the rows' text and button names are the point here.
beforeAll(async () => {
  await i18n.changeLanguage("en-US");
  await preloadNamespaces("en-US");
});

const all: SuggestionPermissions = {
  canUpdate: true,
  canAssign: true,
  canCreateTestCases: true,
};

let queryClient: QueryClient;
const emptyFocusRef = createRef<HTMLHeadingElement>();

function card(
  suggestions: AgentSuggestion[],
  permissions: SuggestionPermissions = all,
) {
  return (
    <QueryClientProvider client={queryClient}>
      <h2 ref={emptyFocusRef} tabIndex={-1}>
        Task readiness
      </h2>
      <SuggestionsCard
        taskId="t1"
        projectId="p1"
        suggestions={suggestions}
        permissions={permissions}
        emptyFocusRef={emptyFocusRef}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  vi.mocked(applyTaskAgentSuggestion).mockResolvedValue({
    ok: true,
    kind: "priority",
    assigneeChanged: false,
    datesChanged: false,
  });
  vi.mocked(dismissTaskAgentSuggestion).mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

const all8 = () => [
  descriptionSuggestion,
  testCasesSuggestion(),
  estimateSuggestion(),
  releaseSuggestion,
  milestoneSuggestion,
  featureSuggestion,
  prioritySuggestion,
  assigneeSuggestion,
];

it("lists field values, then test cases, then description additions", () => {
  render(card(all8()));

  const list = screen.getByRole("list");
  const rows = within(list).getAllByRole("listitem");
  expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
    "Assign to Alice",
    "Set priority: High",
    "Feature: Data export › CSV",
    "Milestone: Beta",
    "Release: 2.0",
    "Estimate 2d",
    "Create 2 test cases for this bug",
    "Acceptance criteria",
  ]);
  const heading = screen.getByRole("heading", { name: "Suggestions" });
  expect(heading.parentElement).toHaveTextContent("8");
  expect(screen.getByText("Planned Dec 1 – Dec 3 for Alice")).toBeVisible();
  expect(screen.getByText("Alice built the export screens.")).toBeVisible();
});

it("names the suggestion on each Apply and Dismiss", () => {
  render(
    card([assigneeSuggestion, estimateSuggestion(), descriptionSuggestion]),
  );

  expect(
    screen.getByRole("button", { name: 'Apply "Assign to Alice"' }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: 'Dismiss "Assign to Alice"' }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: 'Apply "Estimate 2d"' }),
  ).toBeVisible();
  // Its Apply says what it does, then which suggestion.
  expect(
    screen.getByRole("button", {
      name: "Add to description Acceptance criteria",
    }),
  ).toHaveTextContent("Add to description");
  expect(
    screen.getByRole("button", { name: 'Dismiss "Acceptance criteria"' }),
  ).toBeVisible();
});

it("offers only Dismiss without the permission Apply needs", () => {
  render(
    card([assigneeSuggestion, testCasesSuggestion(), prioritySuggestion], {
      canUpdate: true,
      canAssign: false,
      canCreateTestCases: false,
    }),
  );

  expect(
    screen.queryByRole("button", { name: 'Apply "Assign to Alice"' }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: 'Dismiss "Assign to Alice"' }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", {
      name: 'Apply "Create 2 test cases for this bug"',
    }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: 'Apply "Set priority: High"' }),
  ).toBeVisible();
});

it("shows suggestions read-only to people who can't update the task", () => {
  render(
    card([assigneeSuggestion, prioritySuggestion], {
      canUpdate: false,
      canAssign: true,
      canCreateTestCases: true,
    }),
  );

  expect(screen.getByText("Assign to Alice")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Apply|Dismiss/ })).toBeNull();
});

it("says an estimate keeps the task's dates or sets none", () => {
  render(
    card([
      estimateSuggestion({ id: "a", plan: null, keepsDates: true }),
      estimateSuggestion({ id: "b", plan: null }),
    ]),
  );

  expect(screen.getByText("Keeps the task's current dates")).toBeVisible();
  expect(screen.getByText("Sets the estimate only, no dates")).toBeVisible();
});

it("shows the test cases to create behind a toggle", async () => {
  render(
    card([
      testCasesSuggestion({
        target: "milestone",
        milestone: { id: "m1", title: "Beta" },
      }),
    ]),
  );

  expect(screen.getByText("Create 2 test cases in Beta")).toBeVisible();
  const toggle = screen.getByRole("button", { name: "Show test cases" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Export an empty project")).toBeNull();

  fireEvent.click(toggle);

  await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
  expect(screen.getByText("Export an empty project")).toBeVisible();
  expect(screen.getByText("Export 10,000 tasks")).toBeVisible();
  expect(screen.getByText(/Open an empty project/)).toHaveTextContent(
    "Steps: Open an empty project Export as CSV",
  );
  expect(
    screen.getByText("The file has only the header row", { exact: false }),
  ).toHaveTextContent("Expected result: The file has only the header row");
});

it("applies the suggestion it names", async () => {
  render(card([prioritySuggestion]));

  fireEvent.click(
    screen.getByRole("button", { name: 'Apply "Set priority: High"' }),
  );

  await waitFor(() =>
    expect(applyTaskAgentSuggestion).toHaveBeenCalledWith("t1", "s-priority"),
  );
});

it("keeps a description's buttons focusable while Apply runs and after it fails", async () => {
  let refuse: (error: unknown) => void = () => {};
  vi.mocked(applyTaskAgentSuggestion).mockReturnValue(
    new Promise((_resolve, reject) => {
      refuse = reject;
    }),
  );
  render(card([descriptionSuggestion]));
  const apply = screen.getByRole("button", {
    name: "Add to description Acceptance criteria",
  });
  const dismiss = screen.getByRole("button", {
    name: 'Dismiss "Acceptance criteria"',
  });
  act(() => apply.focus());

  fireEvent.click(apply);
  await waitFor(() => expect(apply).toHaveAttribute("aria-disabled", "true"));
  expect(dismiss).toHaveAttribute("aria-disabled", "true");
  expect(apply).toBeEnabled();
  expect(apply).toHaveFocus();
  fireEvent.click(dismiss);
  expect(dismissTaskAgentSuggestion).not.toHaveBeenCalled();
  expect(applyTaskAgentSuggestion).toHaveBeenCalledWith("t1", "s-description");

  await act(async () => refuse(new Error("Conflict")));
  await waitFor(() => expect(apply).not.toHaveAttribute("aria-disabled"));
  expect(apply).toHaveFocus();
});

it("moves focus to the next row's Apply when a row goes", async () => {
  const view = render(card([assigneeSuggestion, prioritySuggestion]));
  const apply = screen.getByRole("button", {
    name: 'Apply "Assign to Alice"',
  });
  act(() => apply.focus());
  fireEvent.click(apply);
  await waitFor(() => expect(applyTaskAgentSuggestion).toHaveBeenCalled());

  view.rerender(card([prioritySuggestion]));

  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: 'Apply "Set priority: High"' }),
  );
});

it("moves focus to the row before when the last row goes", () => {
  const view = render(card([assigneeSuggestion, prioritySuggestion]));
  act(() =>
    screen
      .getByRole("button", { name: 'Dismiss "Set priority: High"' })
      .focus(),
  );

  view.rerender(card([assigneeSuggestion]));

  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: 'Apply "Assign to Alice"' }),
  );
});

it("moves focus to the readiness heading when the last suggestion goes", () => {
  const view = render(card([prioritySuggestion]));
  act(() =>
    screen.getByRole("button", { name: 'Apply "Set priority: High"' }).focus(),
  );

  view.rerender(card([]));

  expect(screen.queryByRole("heading", { name: "Suggestions" })).toBeNull();
  expect(document.activeElement).toBe(emptyFocusRef.current);
});

it("leaves focus alone when someone moved on before the row went", () => {
  const view = render(
    <>
      {card([assigneeSuggestion, prioritySuggestion])}
      <button type="button">Elsewhere</button>
    </>,
  );
  act(() =>
    screen.getByRole("button", { name: 'Apply "Assign to Alice"' }).focus(),
  );
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
  act(() => elsewhere.focus());

  view.rerender(
    <>
      {card([prioritySuggestion])}
      <button type="button">Elsewhere</button>
    </>,
  );

  expect(document.activeElement).toBe(elsewhere);
});
