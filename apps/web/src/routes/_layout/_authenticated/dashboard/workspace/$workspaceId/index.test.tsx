import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Route } from "./index";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ workspaceId: "workspace-1" }),
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("@/components/billing/trial-expired-callout", () => ({
  TrialExpiredCallout: () => null,
}));
vi.mock("@/components/common/workspace-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/home/activity-feed", () => ({
  ActivityFeed: () => null,
}));
vi.mock("@/components/home/home-projects", () => ({
  HomeProjects: () => null,
}));
vi.mock("@/components/home/up-next", () => ({ UpNext: () => null }));
vi.mock("@/components/home/week-strip", () => ({ WeekStrip: () => null }));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/shared/modals/create-project-modal", () => ({
  default: () => null,
}));
vi.mock("@/hooks/queries/task/use-get-assigned-tasks", () => ({
  default: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/use-local-day", () => ({
  useLocalDay: () => "2026-10-16",
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateWorkItems: () => true,
    canCreateProjects: () => true,
  }),
}));

const Home = (Route as unknown as { options: { component: ComponentType } })
  .options.component;

afterEach(cleanup);

describe("workspace home", () => {
  it("offers no New menu, even to members who can create work", () => {
    render(<Home />);

    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeNull();
  });
});
