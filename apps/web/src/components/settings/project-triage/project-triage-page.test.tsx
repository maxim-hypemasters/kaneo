import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { ProjectTriagePage } from "./project-triage-page";

const { replace } = vi.hoisted(() => ({ replace: vi.fn(async () => ({})) }));
let memberIds: string[] = [];
let canUpdate = true;

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: "p1" }),
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "w1" } }),
}));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { id: "p1", name: "Alpha" } }),
}));
vi.mock("@/hooks/queries/triage/use-get-triage-members", () => ({
  useGetTriageMembers: () => ({ data: memberIds, isPending: false }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({
    data: [
      { id: "u1", name: "Ada", email: "ada@example.com" },
      { id: "u2", name: "Grace", email: "grace@example.com" },
    ],
    isPending: false,
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateProjects: () => canUpdate,
    isCheckingPermissions: false,
  }),
}));
vi.mock("@/hooks/mutations/triage/use-replace-triage-members", () => ({
  useReplaceTriageMembers: () => ({ mutateAsync: replace, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

beforeEach(() => {
  memberIds = ["u1"];
  canUpdate = true;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("project triage settings", () => {
  it("lists members and saves without the one removed", () => {
    render(<ProjectTriagePage />);
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "settings:projectTriage.addMember" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:projectTriage.removeMember:Ada",
      }),
    );
    expect(replace).toHaveBeenCalledWith([]);
  });

  it("is read-only without project:update", () => {
    canUpdate = false;
    render(<ProjectTriagePage />);
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("settings:projectTriage.readOnly")).toBeTruthy();
  });

  it("explains that an empty list turns triage off", () => {
    memberIds = [];
    render(<ProjectTriagePage />);
    expect(screen.getByText("settings:projectTriage.emptyTitle")).toBeTruthy();
  });
});
