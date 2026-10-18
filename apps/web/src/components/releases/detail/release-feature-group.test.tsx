import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import { ReleaseFeatureGroup } from "./release-feature-group";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    "aria-describedby": describedBy,
  }: {
    children: ReactNode;
    className?: string;
    "aria-describedby"?: string;
  }) => (
    <a href="/task" className={className} aria-describedby={describedBy}>
      {children}
    </a>
  ),
}));

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    status: "to-do",
    projectId: "project-1",
    type: "task",
    featureId: null,
    releaseId: "r1",
    ...values,
  }) as Task;

const columns = new Map([
  ["to-do", { name: "To Do" }],
  ["done", { name: "Done" }],
]);

function renderGroup(feature: Task) {
  render(
    <ReleaseFeatureGroup
      group={{
        feature,
        inRelease: true,
        tasks: [task("Cart", { featureId: feature.id, status: "done" })],
        tasksElsewhere: 0,
      }}
      workspaceId="workspace-1"
      releaseId="r1"
      projectSlug="KAN"
      columns={columns}
      done={new Set(["done"])}
    />,
  );
}

afterEach(cleanup);

describe("ReleaseFeatureGroup", () => {
  it("says a finished feature is done in text, not only by strike-through", () => {
    renderGroup(task("Checkout", { type: "feature", status: "done" }));

    expect(screen.getByRole("region", { name: "Checkout" })).toBeVisible();
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Checkout");
    expect(heading).toHaveTextContent("Done");
    expect(
      screen.getByRole("link", { name: "Checkout" }),
    ).toHaveAccessibleDescription("Done");
  });

  it("names an open feature's column, or Planned for one on no column", () => {
    renderGroup(task("Checkout", { type: "feature" }));
    expect(
      screen.getByRole("link", { name: "Checkout" }),
    ).toHaveAccessibleDescription("To Do");
    cleanup();

    renderGroup(task("Search", { type: "feature", status: "planned" }));
    expect(
      screen.getByRole("link", { name: "Search" }),
    ).toHaveAccessibleDescription("tasks:status.planned");
  });
});
