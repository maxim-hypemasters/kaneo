import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReleaseDateKind } from "@/types/release";
import type { ReleasePlanChanges } from "@/types/release-plan";
import {
  previewRelease,
  previewTask,
  releasePreview,
} from "../preview/preview-fixtures";
import { ReleasePlanResolution } from "./release-plan-resolution";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/releases/dialog/release-date-field", () => ({
  ReleaseDateField: ({
    kind,
    value,
    disabled,
    onChange,
  }: {
    kind: ReleaseDateKind;
    value: string | null;
    disabled: boolean;
    onChange: (value: string) => void;
  }) => (
    <label>
      {kind}
      <input
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  ),
}));
afterEach(cleanup);
const task = previewTask("a", {
  title: "Build Chat",
  milestoneId: "milestone",
  milestoneTitle: "Core",
  featureId: "feature",
  featureTitle: "Chat",
});
const dependent = previewTask("b", { title: "Test Chat", type: "bug" });
const next = {
  ...previewRelease,
  id: "next",
  name: "0.71",
  startDate: "2026-11-01",
  codeFreezeDate: "2026-11-04",
  submissionDate: "2026-11-05",
};
const preview = releasePreview([task, dependent], {
  warnings: [{ taskId: "a", reason: "after_code_freeze" }],
  dependencies: [{ blockerId: "a", blockedId: "b" }],
});
const props = {
  preview,
  release: previewRelease,
  releases: [previewRelease, next],
  tasks: [task, dependent],
  changes: {},
  pending: false,
  canPlan: true,
};
const key = (name: string) => `tasks:releases.planning.resolution.${name}`;
function openMove() {
  fireEvent.click(screen.getByRole("button", { name: key("moveTask") }));
  return screen.getByRole("dialog", { name: key("moveNext") });
}

describe("code-freeze resolution controls", () => {
  it("toggles each milestone independently from its heading and keeps its move action available", async () => {
    const otherMilestone = previewTask("other", {
      milestoneId: "other-milestone",
      milestoneTitle: "Client",
    });
    render(
      <ReleasePlanResolution
        {...props}
        preview={{ ...preview, tasks: [task, otherMilestone, dependent] }}
        onChange={vi.fn()}
      />,
    );

    const core = within(screen.getByRole("region", { name: "Core" }));
    const client = within(screen.getByRole("region", { name: "Client" }));
    const coreToggle = core.getByRole("button", { name: /^Core\b/ });
    const clientToggle = client.getByRole("button", { name: /^Client\b/ });
    expect(coreToggle).toHaveAttribute("aria-expanded", "true");
    expect(clientToggle).toHaveAttribute("aria-expanded", "true");

    coreToggle.focus();
    expect(coreToggle).toHaveFocus();
    fireEvent.click(coreToggle, { detail: 0 });

    expect(coreToggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(core.queryByRole("list")).toBeNull());
    expect(
      core.getByRole("button", { name: key("moveMilestoneNamed") }),
    ).toBeEnabled();
    expect(clientToggle).toHaveAttribute("aria-expanded", "true");
    expect(client.getByText("Work other")).toBeVisible();
    expect(screen.getByText("Test Chat")).toBeVisible();

    fireEvent.click(coreToggle);
    expect(coreToggle).toHaveAttribute("aria-expanded", "true");
    expect(core.getByText("Build Chat")).toBeVisible();
  });

  it("lists both late tasks and bugs that fit, highlighting and offering a move only for late work", () => {
    render(<ReleasePlanResolution {...props} onChange={vi.fn()} />);
    const group = screen.getByRole("region", { name: "Core" });
    expect(within(group).getByText("Chat")).toBeVisible();
    const late = within(group).getByText("Build Chat").closest("li")!;
    const fitted = screen.getByText("Test Chat").closest("li")!;
    expect(within(late).getByText("Oct 26")).toHaveClass("text-warning");
    expect(
      within(late).getByRole("button", { name: key("moveTask") }),
    ).toBeEnabled();
    expect(within(fitted).getByText("Oct 26")).not.toHaveClass("text-warning");
    expect(
      within(fitted).queryByRole("button", { name: key("moveTask") }),
    ).not.toBeInTheDocument();
  });

  it("hides all conflict actions after the last late task fits while keeping draft Undo", () => {
    const onChange = vi.fn();
    const view = render(
      <ReleasePlanResolution {...props} onChange={onChange} />,
    );
    const actions = [
      "moveMilestoneNamed",
      "moveTask",
      "adjustDates",
      "moveAllLate",
    ];
    for (const action of actions)
      expect(screen.getByRole("button", { name: key(action) })).toBeVisible();

    view.rerender(
      <ReleasePlanResolution
        {...props}
        preview={releasePreview([task, dependent])}
        changes={{ releaseDates: next }}
        onChange={onChange}
      />,
    );
    for (const action of actions)
      expect(
        screen.queryByRole("button", { name: key(action) }),
      ).not.toBeInTheDocument();
    const formerConflict = screen.getByText("Build Chat").closest("li")!;
    expect(within(formerConflict).getByText("Oct 26")).not.toHaveClass(
      "text-warning",
    );
    expect(screen.getByText("Test Chat")).toBeVisible();
    expect(screen.getByRole("button", { name: key("undo") })).toBeEnabled();
  });

  it("shows work without a placement and explains when applying clears a saved placement", () => {
    const unplaced = { start: null, end: null, segments: [] };
    render(
      <ReleasePlanResolution
        {...props}
        preview={releasePreview([
          previewTask("blocked", {
            ...unplaced,
            reason: "blocked_dependency",
            currentStart: task.start,
          }),
          previewTask("completed", { ...unplaced, completed: true }),
          previewTask("archived", { ...unplaced, reason: "archived" }),
        ])}
        onFocusTask={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    const blocked = screen.getByText("Work blocked").closest("li")!;
    expect(blocked).toHaveTextContent(
      "tasks:scheduling.reasons.blockedDependency",
    );
    expect(blocked).toHaveTextContent(
      "tasks:releases.planning.previewChart.clearsPlacement",
    );
    expect(screen.getByText("Work completed").closest("li")).toHaveTextContent(
      "tasks:releases.planning.previewChart.completed",
    );
    expect(screen.getByText("Work archived").closest("li")).toHaveTextContent(
      "tasks:scheduling.reasons.archived",
    );
    expect(screen.queryByRole("button", { name: key("focusTask") })).toBeNull();
  });

  it("offers dependents selected by default and permits moving only the original task without saving", () => {
    const onChange = vi.fn();
    render(<ReleasePlanResolution {...props} onChange={onChange} />);
    const dialog = openMove();
    const checkbox = within(dialog).getByRole("checkbox", {
      name: /Test Chat/,
    });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    );
    expect(onChange).toHaveBeenCalledWith({
      moves: [{ taskId: "a", target: { releaseId: "next" } }],
      newRelease: undefined,
    });
  });

  it("stages every late task and bug together without adding work that fits", () => {
    const onChange = vi.fn();
    const lateBug = previewTask("late-bug", { type: "bug" });
    const updated = releasePreview([task, dependent, lateBug], {
      warnings: [task, lateBug].map(({ taskId }) => ({
        taskId,
        reason: "after_code_freeze",
      })),
      dependencies: [{ blockerId: task.taskId, blockedId: dependent.taskId }],
    });
    render(
      <ReleasePlanResolution
        {...props}
        preview={updated}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: key("moveAllLate") }));
    const dialog = screen.getByRole("dialog", { name: key("moveAllLate") });
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    );
    expect(onChange).toHaveBeenCalledWith({
      moves: [task, lateBug].map(({ taskId }) => ({
        taskId,
        target: { releaseId: next.id },
      })),
      newRelease: undefined,
    });
  });

  it("stages a whole milestone and lets Undo remove its draft destination", () => {
    const onChange = vi.fn();
    const view = render(
      <ReleasePlanResolution
        {...props}
        releases={[previewRelease]}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      within(screen.getByRole("region", { name: "Core" })).getByRole("button", {
        name: key("moveMilestoneNamed"),
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: key("moveMilestoneNamed"),
    });
    expect(within(dialog).getByText(key("moveMilestoneScope"))).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    );
    const changes: ReleasePlanChanges = onChange.mock.calls[0][0];
    expect(changes.milestoneMoves).toEqual([
      {
        milestoneId: "milestone",
        target: { draftKey: changes.newRelease?.key },
      },
    ]);
    expect(changes.moves).toBeUndefined();
    view.rerender(
      <ReleasePlanResolution
        {...props}
        preview={releasePreview([])}
        changes={changes}
        onChange={onChange}
      />,
    );
    const staged = screen.getByRole("region", { name: key("stagedMoves") });
    expect(within(staged).getByText("Core")).toBeVisible();
    fireEvent.click(
      within(staged).getByRole("button", { name: key("undoMove") }),
    );
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("moves only current unfinished source work for a milestone assigned elsewhere", () => {
    const onChange = vi.fn();
    const elsewhere = { ...task, milestoneReleaseId: "elsewhere" };
    const currentTasks = [
      elsewhere,
      { ...elsewhere, taskId: "fits" },
      { ...elsewhere, taskId: "done", completed: true },
      { ...elsewhere, taskId: "archived", reason: "archived" },
    ];
    render(
      <ReleasePlanResolution
        {...props}
        tasks={[...props.tasks, { ...elsewhere, taskId: "moved-externally" }]}
        currentTasks={currentTasks}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      within(screen.getByRole("region", { name: "Core" })).getByRole("button", {
        name: key("moveMilestoneWorkNamed"),
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: key("moveMilestoneWorkNamed"),
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    );
    expect(onChange).toHaveBeenCalledWith({
      moves: ["a", "fits"].map((taskId) => ({
        taskId,
        target: { releaseId: next.id },
      })),
      newRelease: undefined,
    });
  });

  it("stages a new destination and dependent moves when no later release exists", () => {
    const onChange = vi.fn();
    render(
      <ReleasePlanResolution
        {...props}
        releases={[previewRelease]}
        onChange={onChange}
      />,
    );
    const dialog = openMove();
    expect(within(dialog).getByText(key("newReleaseHelp"))).toBeVisible();
    expect(
      within(dialog).getByLabelText("tasks:releases.dialog.nameLabel"),
    ).toHaveValue("0.71");
    fireEvent.click(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    );
    const changes: ReleasePlanChanges = onChange.mock.calls[0][0];
    expect(changes.newRelease?.name).toBe("0.71");
    expect(changes.moves).toEqual(
      ["a", "b"].map((taskId) => ({
        taskId,
        target: { draftKey: changes.newRelease!.key },
      })),
    );
    expect(changes.newRelease!.startDate > previewRelease.startDate).toBe(true);
  });

  it("keeps new release validation failures local with selections retained", () => {
    const onChange = vi.fn();
    render(
      <ReleasePlanResolution
        {...props}
        releases={[previewRelease]}
        onChange={onChange}
      />,
    );
    const dialog = openMove();
    fireEvent.change(
      within(dialog).getByLabelText("tasks:releases.dialog.nameLabel"),
      { target: { value: "" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    );
    expect(
      within(dialog).getByText("tasks:releases.dialog.nameRequired"),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("checkbox", { name: /Test Chat/ }),
    ).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not stage anything when the move dialog closes", () => {
    const onChange = vi.fn();
    render(<ReleasePlanResolution {...props} onChange={onChange} />);
    const dialog = openMove();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /^(Close|common:actions.close)$/,
      }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses existing date controls, keeps Start fixed, and stages the validated pair together", () => {
    const onChange = vi.fn();
    render(<ReleasePlanResolution {...props} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: key("adjustDates") }));
    const dialog = screen.getByRole("dialog", { name: key("adjustDates") });
    expect(within(dialog).queryByLabelText("start")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("submission"), {
      target: { value: "2026-11-03" },
    });
    fireEvent.change(within(dialog).getByLabelText("codeFreeze"), {
      target: { value: "2026-11-02" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    );
    expect(onChange).toHaveBeenCalledWith({
      releaseDates: {
        codeFreezeDate: "2026-11-02",
        submissionDate: "2026-11-03",
      },
    });
  });

  it("preselects dates covering the proposed work without staging anything until confirmation", () => {
    const onChange = vi.fn();
    const late = releasePreview(
      [
        { ...task, end: "2026-11-05T15:00:00Z" },
        { ...dependent, completed: true, end: "2026-12-01T15:00:00Z" },
      ],
      { warnings: preview.warnings },
    );
    render(
      <ReleasePlanResolution {...props} preview={late} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: key("adjustDates") }));
    const dialog = screen.getByRole("dialog", { name: key("adjustDates") });
    expect(within(dialog).getByLabelText("codeFreeze")).toHaveValue(
      "2026-11-05",
    );
    expect(within(dialog).getByLabelText("submission")).toHaveValue(
      "2026-11-06",
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    );
    expect(onChange).toHaveBeenCalledWith({
      releaseDates: {
        codeFreezeDate: "2026-11-05",
        submissionDate: "2026-11-06",
      },
    });
  });

  it("preserves manual date choices while open and refreshes suggestions on reopening", () => {
    const onChange = vi.fn();
    const late = releasePreview([{ ...task, end: "2026-11-05T15:00:00Z" }], {
      warnings: preview.warnings,
    });
    const view = render(
      <ReleasePlanResolution {...props} preview={late} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: key("adjustDates") }));
    let dialog = screen.getByRole("dialog", { name: key("adjustDates") });
    fireEvent.change(within(dialog).getByLabelText("submission"), {
      target: { value: "2026-11-09" },
    });
    fireEvent.change(within(dialog).getByLabelText("codeFreeze"), {
      target: { value: "2026-11-06" },
    });
    const newer = releasePreview([{ ...task, end: "2026-11-10T15:00:00Z" }], {
      warnings: preview.warnings,
    });
    view.rerender(
      <ReleasePlanResolution {...props} preview={newer} onChange={onChange} />,
    );
    expect(within(dialog).getByLabelText("codeFreeze")).toHaveValue(
      "2026-11-06",
    );
    expect(within(dialog).getByLabelText("submission")).toHaveValue(
      "2026-11-09",
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /^(Close|common:actions.close)$/,
      }),
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: key("adjustDates") }));
    dialog = screen.getByRole("dialog", { name: key("adjustDates") });
    expect(within(dialog).getByLabelText("codeFreeze")).toHaveValue(
      "2026-11-10",
    );
    expect(within(dialog).getByLabelText("submission")).toHaveValue(
      "2026-11-11",
    );
  });

  it("blocks invalid date pairs without staging edits", () => {
    const onChange = vi.fn();
    render(<ReleasePlanResolution {...props} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: key("adjustDates") }));
    const dialog = screen.getByRole("dialog", { name: key("adjustDates") });
    fireEvent.change(within(dialog).getByLabelText("codeFreeze"), {
      target: { value: "2026-11-02" },
    });
    const button = within(dialog).getByRole("button", {
      name: key("updatePreview"),
    });
    expect(button).toBeDisabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      key("dateOrder"),
    );
    fireEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    { canPlan: false, pending: false },
    { canPlan: true, pending: true },
  ])(
    "allows closing a local date draft when editing disables without saving: %o",
    (state) => {
      const onChange = vi.fn();
      const view = render(
        <ReleasePlanResolution {...props} onChange={onChange} />,
      );
      fireEvent.click(screen.getByRole("button", { name: key("adjustDates") }));
      view.rerender(
        <ReleasePlanResolution {...props} {...state} onChange={onChange} />,
      );
      const dialog = screen.getByRole("dialog", { name: key("adjustDates") });
      expect(
        within(dialog).getByRole("button", { name: key("updatePreview") }),
      ).toBeDisabled();
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: /^(Close|common:actions.close)$/,
        }),
      );
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("allows closing a local move draft after permission loss without saving", () => {
    const onChange = vi.fn();
    const view = render(
      <ReleasePlanResolution {...props} onChange={onChange} />,
    );
    const dialog = openMove();
    view.rerender(
      <ReleasePlanResolution {...props} canPlan={false} onChange={onChange} />,
    );
    expect(
      within(dialog).getByRole("button", { name: key("updatePreview") }),
    ).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /^(Close|common:actions.close)$/,
      }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows staged moves and prunes an unused draft destination when Undo removes its last move", () => {
    const onChange = vi.fn();
    const changes: ReleasePlanChanges = {
      newRelease: {
        key: "draft",
        name: "0.71",
        startDate: "2026-11-01",
        codeFreezeDate: "2026-11-02",
        submissionDate: "2026-11-03",
      },
      moves: [{ taskId: "a", target: { draftKey: "draft" } }],
    };
    render(
      <ReleasePlanResolution
        {...props}
        preview={releasePreview([])}
        changes={changes}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Build Chat")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: key("undoMove") }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it.each([
    { pending: true, canPlan: true },
    { pending: false, canPlan: false },
  ])(
    "disables date and move actions while pending or read-only: %o",
    (state) => {
      render(
        <ReleasePlanResolution {...props} {...state} onChange={vi.fn()} />,
      );
      expect(
        screen.getByRole("button", { name: key("adjustDates") }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: key("moveTask") }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: key("moveAllLate") }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: key("moveMilestoneNamed") }),
      ).toBeDisabled();
    },
  );
});
