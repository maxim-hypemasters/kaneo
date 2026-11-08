import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { SearchResultItem } from "@/fetchers/search/global-search";
import { FeatureResults } from "./feature-results";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    search,
    children,
    ...props
  }: {
    params: { workspaceId: string; projectId: string; taskId: string };
    search?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      {...props}
      data-search={JSON.stringify(search)}
      href={`/dashboard/workspace/${params.workspaceId}/project/${params.projectId}/task/${params.taskId}`}
    >
      {children}
    </a>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function feature(overrides: Partial<SearchResultItem>): SearchResultItem {
  return {
    id: "feature",
    type: "feature",
    taskType: "feature",
    title: "Checkout",
    projectId: "project",
    projectName: "Web",
    projectSlug: "WEB",
    taskNumber: 4,
    archived: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    relevanceScore: 3,
    ...overrides,
  };
}

afterEach(cleanup);

describe("FeatureResults", () => {
  it("lists Features under their own heading and opens them in the Feature window", () => {
    render(
      <FeatureResults
        workspaceId="workspace"
        results={[
          feature({}),
          feature({ id: "old", title: "Legacy checkout", archived: true }),
        ]}
      />,
    );

    expect(
      screen.getByRole("region", { name: "navigation:search.groups.feature" }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /^WEB-4\s*Checkout/ });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace/project/project/task/feature",
    );
    expect(link).toHaveAttribute("data-search", "{}");
    expect(
      screen.getByRole("link", { name: /Legacy checkout/ }),
    ).toHaveTextContent("tasks:features.library.archived");
    expect(screen.getAllByText("tasks:features.library.archived")).toHaveLength(
      1,
    );
  });

  it("renders nothing without Feature results", () => {
    const { container } = render(
      <FeatureResults
        workspaceId="workspace"
        results={[feature({ type: "task", taskType: "task" })]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
