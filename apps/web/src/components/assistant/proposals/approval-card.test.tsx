import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";
import { ApprovalCard } from "./approval-card";
import { OUTCOME_UNKNOWN_ERROR } from "./proposal-state";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}[${Object.values(options).join("|")}]` : key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

type Preview = NonNullable<AssistantMessage["preview"]>;

function proposal(
  overrides: Partial<AssistantMessage> = {},
  preview: Partial<Preview> = {},
): AssistantMessage {
  return {
    id: "t1",
    role: "tool",
    content: "",
    status: "complete",
    createdAt: "2026-11-17T10:00:00.000Z",
    toolCalls: null,
    toolCallId: "call-1",
    toolName: "update_task",
    approval: "pending",
    isError: false,
    errorText: null,
    preview: {
      target: "KAN-12 Fix login",
      targetKey: "taskId",
      fields: [
        { key: "taskId", kind: "ref", value: "KAN-12 Fix login" },
        { key: "priority", kind: "text", value: "high", from: "low" },
        { key: "userId", kind: "ref", value: "Ada", from: null },
      ],
      diff: null,
      nested: null,
      ...preview,
    },
    resultSummary: null,
    ...overrides,
  };
}

function renderCard(
  message: AssistantMessage,
  props: Partial<{
    disabled: boolean;
    deciding: boolean | null;
    justDecided: boolean;
  }> = {},
) {
  const onDecide = vi.fn();
  render(
    <ApprovalCard
      message={message}
      workspaceSlug="acme"
      disabled={props.disabled ?? false}
      deciding={props.deciding ?? null}
      justDecided={props.justDecided ?? false}
      onDecide={onDecide}
    />,
  );
  return { onDecide };
}

const card = (title: string) => screen.getByRole("group", { name: title });

afterEach(cleanup);

describe("ApprovalCard", () => {
  it("shows a pending update as a labelled group with what changes", () => {
    renderCard(proposal());
    const group = card(
      "workspace:assistant.proposal.title.updateTask[KAN-12 Fix login]",
    );

    // The task already names the card, so its field isn't repeated.
    expect(
      within(group).queryByText("workspace:assistant.proposal.field.taskId"),
    ).toBeNull();
    const priority = within(group)
      .getByText("workspace:assistant.proposal.field.priority")
      .closest("div") as HTMLElement;
    const previous = priority.querySelector("del");
    expect(previous).toHaveTextContent(
      "workspace:assistant.proposal.previously: low",
    );
    expect(priority.querySelector("ins")).toHaveTextContent(
      "workspace:assistant.proposal.now: high",
    );
    // An assignee that was empty before.
    const assignee = within(group)
      .getByText("workspace:assistant.proposal.field.userId")
      .closest("div") as HTMLElement;
    expect(assignee.querySelector("del")).toHaveTextContent(
      "workspace:assistant.proposal.none",
    );
    expect(assignee.querySelector("ins")).toHaveTextContent("Ada");
    expect(group).toHaveTextContent("workspace:assistant.proposal.runsAsYou");
  });

  it("sends the card's own id with Approve and Reject", () => {
    const { onDecide } = renderCard(proposal({ id: "msg-9" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace:assistant.proposal.approve",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace:assistant.proposal.reject",
      }),
    );
    expect(onDecide.mock.calls).toEqual([
      ["msg-9", true],
      ["msg-9", false],
    ]);
  });

  it("can't be decided while a decision is on its way", () => {
    const { onDecide } = renderCard(proposal(), {
      disabled: true,
      deciding: true,
    });
    // A loading button's name ends with its spinner's.
    const approve = screen.getByRole("button", {
      name: /^workspace:assistant\.proposal\.approve/,
    });
    const reject = screen.getByRole("button", {
      name: "workspace:assistant.proposal.reject",
    });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute("data-loading");
    expect(reject).toBeDisabled();
    expect(reject).not.toHaveAttribute("data-loading");
    fireEvent.click(approve);
    expect(onDecide).not.toHaveBeenCalled();
    expect(
      card("workspace:assistant.proposal.title.updateTask[KAN-12 Fix login]"),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("titles a new bug by its project and lists its Markdown", () => {
    renderCard(
      proposal(
        { toolName: "create_task" },
        {
          target: "Mobile",
          targetKey: "projectId",
          fields: [
            { key: "projectId", kind: "ref", value: "Mobile" },
            { key: "title", kind: "text", value: "Crash on start" },
            { key: "type", kind: "text", value: "bug" },
            {
              key: "description",
              kind: "markdown",
              value: "Steps:\n\n1. **Open** the app",
            },
            { key: "dueDate", kind: "date", value: "2026-11-20" },
            { key: "notAField", kind: "text", value: "x" },
          ],
        },
      ),
    );
    const group = card("workspace:assistant.proposal.title.createBug[Mobile]");
    expect(within(group).getByText("Crash on start")).toBeInTheDocument();
    expect(within(group).getByText("Open").tagName).toBe("STRONG");
    expect(within(group).getByText("Nov 20, 2026")).toBeInTheDocument();
    expect(
      within(group).getByText("workspace:assistant.proposal.field.fallback"),
    ).toBeInTheDocument();
    expect(group.querySelector("del")).toBeNull();
  });

  it("shows a rewrite as a diff and a new Feature's nested work", () => {
    renderCard(
      proposal(
        { toolName: "create_task" },
        {
          target: "Mobile",
          targetKey: "projectId",
          fields: [{ key: "type", kind: "text", value: "feature" }],
          diff: { before: "Old line\n", after: "New line\n" },
          nested: {
            milestones: [
              {
                title: "Beta",
                leadLabel: "Ada",
                releaseLabel: "v2.0",
                priority: "high",
                tasks: [
                  {
                    title: "Invite testers",
                    type: "bug",
                    estimateSeconds: 9000,
                    existing: false,
                  },
                  {
                    title: "KAN-12 Fix login",
                    type: null,
                    estimateSeconds: null,
                    existing: true,
                  },
                ],
              },
            ],
            tasks: [
              {
                title: "Write docs",
                type: null,
                estimateSeconds: null,
                existing: false,
              },
            ],
            unassignedReleaseLabel: "v1.9",
          },
        },
      ),
    );
    const group = card(
      "workspace:assistant.proposal.title.createFeature[Mobile]",
    );
    const diff = within(group).getByRole("region", {
      name: "workspace:assistant.proposal.diff.label",
    });
    expect(diff).toHaveTextContent(
      "workspace:assistant.proposal.diff.removed: Old line",
    );
    expect(diff).toHaveTextContent(
      "workspace:assistant.proposal.diff.added: New line",
    );
    const nested = within(group).getByRole("list", {
      name: "workspace:assistant.proposal.nested.label",
    });
    const [beta, unassigned] = Array.from(nested.children) as HTMLElement[];
    expect(beta).toHaveTextContent("Beta");
    expect(beta).toHaveTextContent(
      "workspace:assistant.proposal.nested.lead[Ada] · workspace:assistant.proposal.nested.release[v2.0] · workspace:assistant.proposal.nested.priority[tasks:priority.high]",
    );
    const [bug, existing] = within(beta as HTMLElement).getAllByRole(
      "listitem",
    );
    expect(bug).toHaveTextContent(
      "Invite testersworkspace:assistant.proposal.nested.bug · workspace:assistant.proposal.nested.estimate[2h 30m]",
    );
    // Linked work keeps its own type and estimate.
    expect(existing).toHaveTextContent(
      "KAN-12 Fix loginworkspace:assistant.proposal.nested.existing",
    );
    expect(existing).not.toHaveTextContent(
      "workspace:assistant.proposal.nested.task",
    );
    expect(unassigned).toHaveTextContent(
      "workspace:assistant.proposal.nested.noMilestoneworkspace:assistant.proposal.nested.unassignedRelease[v1.9]",
    );
    // A draft without a type is created as a Task.
    expect(unassigned).toHaveTextContent(
      "Write docsworkspace:assistant.proposal.nested.task",
    );
  });

  it("shows the release for new work outside a milestone even without tasks", () => {
    renderCard(
      proposal(
        { toolName: "create_task" },
        {
          target: "Mobile",
          targetKey: "projectId",
          fields: [{ key: "type", kind: "text", value: "feature" }],
          nested: {
            milestones: [],
            tasks: [],
            unassignedReleaseLabel: "v1.9",
          },
        },
      ),
    );
    const nested = screen.getByRole("list", {
      name: "workspace:assistant.proposal.nested.label",
    });
    expect(nested).toHaveTextContent(
      "workspace:assistant.proposal.nested.noMilestoneworkspace:assistant.proposal.nested.unassignedRelease[v1.9]",
    );
  });

  it("shows what an approved change made, with a link into the app", () => {
    renderCard(
      proposal({
        approval: "approved",
        resultSummary: {
          label: "Updated KAN-12 Fix login",
          href: "/acme/task/KAN-12",
        },
      }),
    );
    const group = card(
      "workspace:assistant.proposal.title.updateTask[KAN-12 Fix login]",
    );
    expect(within(group).queryByRole("button")).toBeNull();
    expect(group).toHaveTextContent("Updated KAN-12 Fix login");
    const link = within(group).getByRole("link", {
      name: "workspace:assistant.proposal.open Updated KAN-12 Fix login",
    });
    expect(link).toHaveAttribute("href", "/acme/task/KAN-12");
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith({ href: "/acme/task/KAN-12" });
  });

  it("reports a change that just failed as an alert with the API's reason", () => {
    renderCard(
      proposal({
        approval: "approved",
        isError: true,
        errorText: "You no longer have permission to update tasks.",
      }),
      { justDecided: true },
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("workspace:assistant.proposal.failed");
    expect(alert).toHaveTextContent(
      "You no longer have permission to update tasks.",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a failure loaded from history as plain text", () => {
    renderCard(
      proposal({
        approval: "approved",
        isError: true,
        errorText: "You no longer have permission to update tasks.",
      }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByText("workspace:assistant.proposal.failed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You no longer have permission to update tasks."),
    ).toBeInTheDocument();
  });

  it("marks only a waiting card's heading as the next focus target", () => {
    renderCard(proposal());
    const heading = screen.getByRole("heading", {
      name: "workspace:assistant.proposal.title.updateTask[KAN-12 Fix login]",
    });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveAttribute("data-pending-proposal");
    cleanup();
    renderCard(
      proposal({
        approval: "approved",
        resultSummary: { label: "Updated", href: null },
      }),
    );
    expect(screen.getByRole("heading")).not.toHaveAttribute(
      "data-pending-proposal",
    );
  });

  it.each([
    proposal({
      approval: "approved",
      isError: true,
      errorText: OUTCOME_UNKNOWN_ERROR,
    }),
    proposal({ approval: "approved" }),
  ])("says when an approved change's outcome is unknown", (message) => {
    renderCard(message);
    expect(
      screen.getByText("workspace:assistant.proposal.unknown"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    ["rejected", "workspace:assistant.proposal.rejected"],
    ["skipped", "workspace:assistant.proposal.skipped"],
  ] as const)("folds a %s change into one line", (approval, label) => {
    renderCard(proposal({ approval }));
    const group = card(
      "workspace:assistant.proposal.title.updateTask[KAN-12 Fix login]",
    );
    expect(group).toHaveTextContent(label);
    expect(
      within(group).queryByText("workspace:assistant.proposal.field.priority"),
    ).toBeNull();
    expect(within(group).queryByRole("button")).toBeNull();
  });

  it("falls back to a generic title for an unknown tool", () => {
    renderCard(proposal({ toolName: "mystery_tool" }));
    expect(
      card("workspace:assistant.proposal.title.fallback[KAN-12 Fix login]"),
    ).toBeInTheDocument();
  });
});
