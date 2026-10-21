import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { emptyFeatureComposition, featureCompositionInput } from "./draft";
import { FeatureComposer } from "./feature-composer";
import type { FeatureCompositionDraft, FeatureMilestoneDraft } from "./types";

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  error: false,
  pending: false,
  retry: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("@/lib/i18n/domain", () => ({
  getPriorityLabel: (value: string) => value,
  getStatusDisplayLabel: (value: string) => value,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      args?: { index?: number; title?: string; count?: number },
    ) =>
      args?.index
        ? `${key} ${args.index}`
        : args?.title
          ? `${key}: ${args.title}${args.count === undefined ? "" : ` (${args.count})`}`
          : key,
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => true,
    canAssignTasks: () => true,
  }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({
    data: [
      { id: "origin", name: "Origin release" },
      { id: "other", name: "Other release" },
    ],
  }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/task/use-feature-link-candidates", () => ({
  useFeatureLinkCandidates: (...args: unknown[]) => mocks.candidates(...args),
}));
vi.mock("@/components/settings/confirm-dialog", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/settings/confirm-dialog")
    >();
  return {
    ...actual,
    ConfirmDialog: (props: ComponentProps<typeof actual.ConfirmDialog>) => (
      <>
        <actual.ConfirmDialog {...props} />
        <output data-testid="removal-copy" data-open={props.open}>
          {props.description}
        </output>
      </>
    ),
  };
});

const candidate = (
  id: string,
  title: string,
  type: "task" | "bug" = "task",
) => ({
  id,
  title,
  type,
  number: Number(id),
  projectSlug: "WEB",
  releaseId: null,
  releaseName: null,
});
const milestone = (key: string, title: string): FeatureMilestoneDraft => ({
  key,
  title,
  leadId: null,
  priority: "no-priority",
  releaseId: "origin",
});
function Harness({
  initial,
  disabled = false,
  canManage = true,
}: {
  initial?: FeatureCompositionDraft;
  disabled?: boolean;
  canManage?: boolean;
}) {
  const [value, setValue] = useState(
    initial ?? emptyFeatureComposition("origin"),
  );
  return (
    <>
      <FeatureComposer
        projectId="p"
        workspaceId="w"
        value={value}
        onChange={setValue}
        disabled={disabled}
        canManage={canManage}
        defaultReleaseId="origin"
      />
      <output data-testid="payload">
        {JSON.stringify(featureCompositionInput(value))}
      </output>
    </>
  );
}
const payload = () =>
  JSON.parse(screen.getByTestId("payload").textContent ?? "{}");
const card = (title: string) => screen.getByRole("group", { name: title });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.error = false;
  mocks.pending = false;
  mocks.candidates.mockImplementation((_project, query, page) => ({
    data: {
      data: query
        ? []
        : page === 1
          ? [candidate("1", "Existing Task")]
          : [candidate("2", "Existing Bug", "bug")],
      pagination: { totalPages: 2 },
    },
    isPending: mocks.pending,
    isError: mocks.error,
    isFetching: false,
    refetch: mocks.retry,
  }));
});
afterEach(cleanup);

async function newDraft(
  milestoneCard: HTMLElement,
  type: "task" | "bug",
  title: string,
) {
  fireEvent.click(
    within(milestoneCard).getByRole("button", {
      name: "tasks:createMenu.label",
    }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", {
      name:
        type === "task"
          ? "tasks:createMenu.newTask"
          : "tasks:createMenu.newBug",
    }),
  );
  const inputs = within(milestoneCard).getAllByRole("textbox", {
    name: /tasks:milestones.newTaskTitle/,
  });
  const input = inputs.at(-1)!;
  fireEvent.change(input, { target: { value: title } });
  return input;
}
function addMilestone(title: string) {
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:featureComposer.addMilestone" }),
  );
  const titles = screen.getAllByRole("textbox", {
    name: /tasks:featureComposer.milestoneTitle/,
  });
  fireEvent.change(titles.at(-1)!, { target: { value: title } });
}
function openPicker() {
  fireEvent.click(
    screen.getByRole("searchbox", {
      name: "tasks:featureComposer.searchTasks",
    }),
  );
}
async function chooseMilestone(
  workTitle: string,
  title: string,
  keyboard = false,
) {
  const trigger = screen.getByRole("button", {
    name: `tasks:featureComposer.workMilestone: ${workTitle}`,
  });
  if (keyboard) {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
  } else fireEvent.click(trigger);
  const option = await screen.findByRole("menuitemradio", { name: title });
  if (keyboard) {
    option.focus();
    fireEvent.keyDown(option, { key: "Enter" });
  } else fireEvent.click(option);
  await waitFor(() =>
    expect(
      screen.queryByRole("menuitemradio", { name: title }),
    ).not.toBeInTheDocument(),
  );
}

describe("Feature composer", () => {
  it("creates Task and Bug drafts directly in their milestone cards and groups linked work there", async () => {
    render(<Harness />);
    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.label" }),
    ).not.toBeInTheDocument();
    addMilestone("Launch");
    addMilestone("Follow-up");
    for (const key of [
      "tasks:status.label",
      "tasks:milestones.startDate",
      "tasks:milestones.endDate",
      "tasks:milestones.newTasks",
      "tasks:featureComposer.unassignedRelease",
    ])
      expect(screen.queryByText(key)).not.toBeInTheDocument();
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Existing Task/ }));
    expect(
      within(
        screen.getByRole("region", { name: "tasks:milestones.none" }),
      ).getByText("Existing Task"),
    ).toBeInTheDocument();
    await chooseMilestone("Existing Task", "Launch");
    await newDraft(card("Launch"), "task", "Build launch");
    await newDraft(card("Follow-up"), "bug", "Fix follow-up");
    expect(
      within(card("Launch")).getByText("Existing Task"),
    ).toBeInTheDocument();
    expect(
      within(card("Launch")).getByDisplayValue("Build launch"),
    ).toBeInTheDocument();
    expect(
      within(card("Follow-up")).getByDisplayValue("Fix follow-up"),
    ).toBeInTheDocument();
    const value = payload();
    expect(value.milestones).toEqual([
      expect.objectContaining({
        title: "Launch",
        releaseId: "origin",
        leadId: null,
        priority: "no-priority",
      }),
      expect.objectContaining({ title: "Follow-up", releaseId: "origin" }),
    ]);
    expect(value.existingTasks).toEqual([
      { id: "1", milestoneKey: value.milestones[0].key },
    ]);
    expect(value.newTasks).toEqual([
      {
        title: "Build launch",
        type: "task",
        milestoneKey: value.milestones[0].key,
      },
      {
        title: "Fix follow-up",
        type: "bug",
        milestoneKey: value.milestones[1].key,
      },
    ]);
    expect(value).not.toHaveProperty("unassignedReleaseId");
  });

  it("omits milestone selectors inside cards and lets existing work be removed and selected again", async () => {
    render(<Harness />);
    addMilestone("First");
    addMilestone("Second");
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Existing Task/ }));
    await chooseMilestone("Existing Task", "First");
    await newDraft(card("First"), "bug", "Keep me here");
    expect(
      within(card("First")).queryByRole("button", {
        name: /tasks:featureComposer.workMilestone/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(card("First")).getByRole("button", {
        name: "tasks:milestones.newTaskType 1",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("tasks:milestones.newTasksCount"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(card("First")).getByRole("button", {
        name: "tasks:featureComposer.removeExistingTask: Existing Task",
      }),
    );
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Existing Task/ }));
    await chooseMilestone("Existing Task", "Second");
    expect(
      within(card("Second")).getByText("Existing Task"),
    ).toBeInTheDocument();
    expect(payload().newTasks[0].milestoneKey).toBe(
      payload().milestones[0].key,
    );
    expect(payload().existingTasks[0].milestoneKey).toBe(
      payload().milestones[1].key,
    );
  });

  it("confirms removal of a milestone with new drafts and keeps existing work selected", async () => {
    render(<Harness />);
    addMilestone("Launch");
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Existing Task/ }));
    await chooseMilestone("Existing Task", "Launch");
    await newDraft(card("Launch"), "bug", "Unsaved bug");
    const before = payload();
    const remove = () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "tasks:featureComposer.removeMilestone 1",
        }),
      );
    remove();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "tasks:featureComposer.removeMilestoneWithWorkDescription: Launch",
    );
    expect(payload()).toEqual(before);
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(payload()).toEqual(before);
    remove();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "tasks:featureComposer.removeMilestoneWithWorkConfirm",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(payload().milestones).toEqual([]);
    expect(payload().newTasks).toEqual([]);
    expect(payload().existingTasks).toEqual([{ id: "1", milestoneKey: null }]);
    expect(
      within(
        screen.getByRole("region", { name: "tasks:milestones.none" }),
      ).getByText("Existing Task"),
    ).toBeInTheDocument();
    openPicker();
    expect(
      screen.getByRole("checkbox", { name: /Existing Task/ }),
    ).toBeChecked();
  });

  it("retains the removal title and draft count while the confirmation closes", async () => {
    render(<Harness />);
    addMilestone("Launch snapshot");
    await newDraft(card("Launch snapshot"), "task", "First draft");
    await newDraft(card("Launch snapshot"), "bug", "Second draft");
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:featureComposer.removeMilestone 1",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    const description =
      "tasks:featureComposer.removeMilestoneWithWorkDescription: Launch snapshot (2)";
    expect(dialog).toHaveTextContent(description);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:featureComposer.removeMilestoneWithWorkConfirm",
      }),
    );
    expect(payload().milestones).toEqual([]);
    expect(screen.getByTestId("removal-copy")).toHaveAttribute(
      "data-open",
      "false",
    );
    expect(screen.getByTestId("removal-copy")).toHaveTextContent(description);
    expect(screen.getByTestId("removal-copy")).not.toHaveTextContent(
      "tasks:featureComposer.draftMilestone 0",
    );
  });

  it("removes a milestone without new drafts immediately and unassigns its existing work", async () => {
    render(<Harness />);
    addMilestone("Empty of drafts");
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Existing Task/ }));
    await chooseMilestone("Existing Task", "Empty of drafts");
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:featureComposer.removeMilestone 1",
      }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(payload().milestones).toEqual([]);
    expect(payload().existingTasks).toEqual([{ id: "1", milestoneKey: null }]);
  });

  it("keeps selected work across pages and searches, and supports removal", async () => {
    render(<Harness />);
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Existing Task/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "common:pagination.nextPage" }),
    );
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Existing Bug/ }));
    expect(
      payload().existingTasks.map((task: { id: string }) => task.id),
    ).toEqual(["1", "2"]);
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "tasks:featureComposer.searchTasks",
      }),
      { target: { value: "missing" } },
    );
    await waitFor(() =>
      expect(
        screen.getByText("tasks:featureComposer.noMatches"),
      ).toBeInTheDocument(),
    );
    expect(payload().existingTasks).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:featureComposer.removeExistingTask: Existing Task",
      }),
    );
    expect(payload().existingTasks).toEqual([
      expect.objectContaining({ id: "2" }),
    ]);
  });

  it("keeps each milestone's release choice and preserves existing release metadata", async () => {
    const initial = emptyFeatureComposition("origin");
    initial.milestones = [
      milestone("first", "First"),
      milestone("second", "Second"),
    ];
    initial.existingTasks = [
      {
        ...candidate("1", "Existing Task"),
        releaseId: "old",
        releaseName: "Old release",
        milestoneKey: "first",
      },
    ];
    render(<Harness initial={initial} />);
    fireEvent.click(
      within(card("First")).getByRole("button", {
        name: "tasks:releases.property",
      }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "tasks:releases.none" }),
    );
    await newDraft(card("First"), "task", "No release draft");
    await newDraft(card("Second"), "bug", "Origin release draft");
    expect(
      payload().milestones.map(
        (item: { releaseId: string | null }) => item.releaseId,
      ),
    ).toEqual([null, "origin"]);
    expect(within(card("First")).getByText(/Old release/)).toBeInTheDocument();
    expect(payload().existingTasks).toEqual([
      { id: "1", milestoneKey: "first" },
    ]);
    expect(payload()).not.toHaveProperty("unassignedReleaseId");
  });

  it("renames and reorders duplicate-title cards without changing work references", async () => {
    const initial = emptyFeatureComposition("origin");
    initial.milestones = [
      milestone("first", "Same"),
      milestone("second", "Same"),
    ];
    initial.newTasks = [
      { key: "work", type: "task", title: "Keep work", milestoneKey: "first" },
    ];
    render(<Harness initial={initial} />);
    const first = screen.getAllByRole("group", { name: "Same" })[0];
    fireEvent.change(
      within(first).getByRole("textbox", {
        name: /tasks:featureComposer.milestoneTitle/,
      }),
      { target: { value: "Renamed" } },
    );
    fireEvent.click(
      within(card("Renamed")).getByRole("button", {
        name: "tasks:milestones.moveDown",
      }),
    );
    expect(
      payload().milestones.map((item: { key: string }) => item.key),
    ).toEqual(["second", "first"]);
    expect(payload().newTasks[0]).toEqual({
      title: "Keep work",
      type: "task",
      milestoneKey: "first",
    });
    expect(
      within(card("Renamed")).getByDisplayValue("Keep work"),
    ).toBeInTheDocument();
  });

  it("edits and removes one draft without replacing work in other cards", async () => {
    const initial = emptyFeatureComposition("origin");
    initial.milestones = [
      milestone("first", "First"),
      milestone("second", "Second"),
    ];
    initial.newTasks = [
      { key: "edit", type: "task", title: "Edit this", milestoneKey: "first" },
      { key: "keep", type: "bug", title: "Keep this", milestoneKey: "second" },
    ];
    render(<Harness initial={initial} />);
    fireEvent.click(
      within(card("First")).getByRole("button", {
        name: "tasks:milestones.newTaskType 1",
      }),
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", {
        name: "tasks:features.typeBug",
      }),
    );
    expect(payload().newTasks).toEqual([
      { type: "bug", title: "Edit this", milestoneKey: "first" },
      { type: "bug", title: "Keep this", milestoneKey: "second" },
    ]);
    fireEvent.click(
      within(card("First")).getByRole("button", {
        name: "tasks:milestones.removeNewTask 1",
      }),
    );
    expect(payload().newTasks).toEqual([
      { type: "bug", title: "Keep this", milestoneKey: "second" },
    ]);
    expect(
      within(card("Second")).getByDisplayValue("Keep this"),
    ).toBeInTheDocument();
  });

  it("enforces the new-work batch limit across every milestone card", () => {
    const initial = emptyFeatureComposition("origin");
    initial.milestones = [
      milestone("first", "First"),
      milestone("second", "Second"),
    ];
    initial.newTasks = Array.from({ length: 100 }, (_, index) => ({
      key: String(index),
      title: `Work ${index}`,
      type: "task",
      milestoneKey: index % 2 ? "first" : "second",
    }));
    render(<Harness initial={initial} />);
    const menus = screen.getAllByRole("button", {
      name: "tasks:createMenu.label",
    });
    expect(menus).toHaveLength(2);
    for (const menu of menus) expect(menu).toBeDisabled();
    expect(payload().newTasks).toHaveLength(100);
  });

  it("focuses new titles and the destination row after assigning existing work by keyboard", async () => {
    render(<Harness />);
    addMilestone("First");
    const input = await newDraft(card("First"), "task", "Keep title focus");
    expect(input).toHaveFocus();
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Existing Task/ }));
    await chooseMilestone("Existing Task", "First", true);
    const destination = within(card("First")).getByRole("group", {
      name: "Existing Task",
    });
    await waitFor(() => expect(destination).toHaveFocus());
    expect(destination).toHaveAttribute("tabindex", "-1");
    expect(
      screen.queryByRole("button", {
        name: "tasks:featureComposer.workMilestone: Existing Task",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(card("First")).getByDisplayValue("Keep title focus"),
    ).not.toHaveFocus();
  });

  it("offers loading/retry feedback and hides child controls without milestone management permission", () => {
    mocks.pending = true;
    const { rerender } = render(<Harness />);
    openPicker();
    expect(
      screen.getByText("tasks:featureComposer.loadingTasks"),
    ).toHaveAttribute("role", "status");
    mocks.pending = false;
    mocks.error = true;
    rerender(<Harness />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:featureComposer.loadTasksError",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(mocks.retry).toHaveBeenCalledOnce();
    mocks.candidates.mockClear();
    rerender(<Harness canManage={false} />);
    expect(mocks.candidates).not.toHaveBeenCalled();
    for (const name of [
      "tasks:featureComposer.addMilestone",
      "tasks:createMenu.label",
    ])
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", {
        name: "tasks:featureComposer.searchTasks",
      }),
    ).not.toBeInTheDocument();
  });

  it("freezes all controls and preserves the hierarchy while saving", async () => {
    const { rerender } = render(<Harness />);
    addMilestone("Keep me");
    await newDraft(card("Keep me"), "task", "Unchanged");
    const before = payload();
    openPicker();
    rerender(<Harness disabled />);
    for (const textbox of screen.getAllByRole("textbox"))
      expect(textbox).toBeDisabled();
    for (const button of screen.getAllByRole("button"))
      expect(button).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /Existing Task/ }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(payload()).toEqual(before);
  });
});
