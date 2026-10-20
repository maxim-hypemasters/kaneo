import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { MilestonePlanningFields } from "./milestone-planning-fields";
const mocks = vi.hoisted(() => ({ assign: true, update: true }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/i18n/domain", () => ({
  getPriorityLabel: (priority: string) => priority,
  getStatusDisplayLabel: (status: string, name?: string) => name ?? status,
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => mocks.update,
    canAssignTasks: () => mocks.assign,
  }),
}));
vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({
    data: [
      { id: "todo", slug: "to-do", name: "To Do", isFinal: false },
      { id: "done", slug: "done", name: "Done", isFinal: true },
    ],
  }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({ data: [{ id: "r", name: "0.70" }] }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({
    data: [{ id: "u", name: "Ava", email: "ava@example.com", image: null }],
  }),
}));
beforeEach(() => {
  mocks.assign = true;
  mocks.update = true;
});
afterEach(cleanup);
const milestone = {
  leadId: null,
  status: "to-do",
  priority: "no-priority" as const,
  releaseId: null,
  startDate: null,
  endDate: null,
};
describe("Milestone planning controls", () => {
  it("changes only the selected milestone planning field", async () => {
    const onChange = vi.fn();
    render(
      <MilestonePlanningFields
        projectId="p"
        workspaceId="w"
        milestone={milestone}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.lead" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /Ava/ }));
    expect(onChange).toHaveBeenCalledWith({ leadId: "u" });
    fireEvent.click(screen.getByRole("button", { name: "tasks:status.label" }));
    fireEvent.click(await screen.findByRole("option", { name: /Done/ }));
    expect(onChange).toHaveBeenLastCalledWith({ status: "done" });
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.property" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "0.70" }));
    expect(onChange).toHaveBeenLastCalledWith({ releaseId: "r" });
    expect(onChange).toHaveBeenCalledTimes(3);
  });
  it("keeps lead assignment permission separate from other milestone edits", () => {
    mocks.assign = false;
    render(
      <MilestonePlanningFields
        projectId="p"
        workspaceId="w"
        milestone={milestone}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "tasks:milestones.lead" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "tasks:status.label" }),
    ).toBeEnabled();
  });
  it("keeps planning readable without update permission", () => {
    mocks.update = false;
    render(
      <MilestonePlanningFields
        projectId="p"
        workspaceId="w"
        milestone={milestone}
        onChange={vi.fn()}
      />,
    );
    for (const name of [
      "tasks:milestones.lead",
      "tasks:status.label",
      "tasks:priority.label",
      "tasks:releases.property",
      "tasks:milestones.startDate",
      "tasks:milestones.endDate",
    ])
      expect(screen.getByRole("button", { name })).toBeDisabled();
  });
});
