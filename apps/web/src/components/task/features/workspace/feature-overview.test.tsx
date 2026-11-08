import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import { FeatureOverview } from "./feature-overview";

vi.mock("../../task-description", () => ({
  default: () => <p>Description</p>,
}));
vi.mock("./feature-latest-update", () => ({
  FeatureLatestUpdate: () => <p>Latest update</p>,
}));
vi.mock("../../task-relations", () => ({
  default: () => <p>Relations</p>,
}));
vi.mock("@/hooks/queries/external-link/use-external-links", () => ({
  default: (taskId: string) => ({
    data: [{ id: `link-of-${taskId}` }],
    isLoading: false,
  }),
}));
vi.mock("@/components/external-links/external-links-accordion", () => ({
  ExternalLinksAccordion: ({
    taskId,
    externalLinks,
  }: {
    taskId: string;
    externalLinks: { id: string }[];
  }) => (
    <section aria-label="Resources">
      {taskId}: {externalLinks.map((link) => link.id).join(", ")}
    </section>
  ),
}));

afterEach(cleanup);

it("shows a feature's resources but no task relations", () => {
  render(
    <FeatureOverview
      feature={{ id: "feature-1", projectId: "project-1" } as Task}
      onOpenActivity={vi.fn()}
    />,
  );

  expect(screen.getByText("Description")).toBeInTheDocument();
  expect(screen.getByText("Latest update")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Resources" })).toHaveTextContent(
    "feature-1: link-of-feature-1",
  );
  expect(screen.queryByText("Relations")).not.toBeInTheDocument();
});
