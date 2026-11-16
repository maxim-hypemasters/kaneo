import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import { TriageTaskRow } from "./triage-task-row";

const { accept, decline, navigate } = vi.hoisted(() => ({
  accept: vi.fn(async () => ({})),
  decline: vi.fn(async () => ({})),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/hooks/use-task-hover-prefetch", () => ({
  useTaskHoverPrefetch: () => ({}),
}));
vi.mock("@/components/list-view/task-row-body", () => ({
  TaskRowBody: ({ task }: { task: Task }) => <span>{task.title}</span>,
}));
vi.mock("@/hooks/mutations/triage/use-accept-triage", () => ({
  useAcceptTriage: () => ({ mutateAsync: accept, isPending: false }),
}));
vi.mock("@/hooks/mutations/triage/use-decline-triage", () => ({
  useDeclineTriage: () => ({ mutateAsync: decline, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: "en-US" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const task = {
  id: "t1",
  title: "Login fails",
  projectId: "p1",
  status: "triage",
  type: "bug",
  createdAt: new Date().toISOString(),
  createdBy: "u2",
  userId: null,
  externalLinks: [],
} as unknown as Task;

const members = [{ userId: "u2", user: { name: "Grace" } }];

function renderRow(canTriage: boolean, row: Task = task) {
  return render(
    <ul>
      <TriageTaskRow
        task={row}
        projectSlug="KAN"
        workspaceId="w1"
        members={members}
        canTriage={canTriage}
      />
    </ul>,
  );
}

describe("triage task row", () => {
  it("lets triage members accept or decline, without opening the task", async () => {
    renderRow(true);
    const acceptButton = screen.getByRole("button", {
      name: /tasks:triage.acceptLabel.*Login fails/,
    });
    expect(
      screen.getByRole("button", {
        name: /tasks:triage.declineLabel.*Login fails/,
      }),
    ).toBeTruthy();
    fireEvent.click(acceptButton);
    expect(accept).toHaveBeenCalledWith("t1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows everyone else that the work is waiting", () => {
    renderRow(false);
    expect(screen.queryByRole("button", { name: /acceptLabel/ })).toBeNull();
    expect(screen.getByText("tasks:triage.waiting")).toBeTruthy();
  });

  it("names the reporter, or the issue author for integration work", () => {
    renderRow(false);
    expect(screen.getByText(/reportedBy.*Grace/)).toBeTruthy();
    cleanup();
    renderRow(false, {
      ...task,
      createdBy: null,
      externalLinks: [
        {
          id: "l",
          taskId: "t1",
          integrationId: "i",
          resourceType: "issue",
          externalId: "7",
          url: "https://github.com/a/b/issues/7",
          title: null,
          metadata: { author: "octocat" },
        },
      ],
    });
    expect(screen.getByText(/reportedBy.*octocat/)).toBeTruthy();
  });

  it("opens the task when the row is clicked", () => {
    renderRow(false);
    fireEvent.click(screen.getByText("Login fails"));
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { taskId: "t1" } }),
    );
  });
});
