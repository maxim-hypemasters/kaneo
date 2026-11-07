import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import SearchCommandMenu from "./index";

const m = vi.hoisted(() => ({ navigate: vi.fn(), setOpen: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => m.navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/project/views/use-open-project", () => ({
  useOpenProject: () => vi.fn(),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace" } }),
}));
vi.mock("@/hooks/queries/search/use-global-search", () => ({
  default: () => ({
    data: {
      results: [
        {
          id: "document",
          type: "document",
          title: "Rollout plan",
          content: "…stage the payment retry rollout…",
          featureId: "feature",
          featureTitle: "Checkout",
          projectId: "project",
        },
      ],
    },
  }),
}));

afterEach(cleanup);

describe("SearchCommandMenu", () => {
  it("opens a Feature document from its search result", () => {
    render(<SearchCommandMenu open setOpen={m.setOpen} />);
    fireEvent.change(
      screen.getByPlaceholderText("navigation:search.inputPlaceholder"),
      { target: { value: "retry" } },
    );

    expect(screen.getByText("navigation:search.groups.document")).toBeTruthy();
    expect(
      screen.getByText("Checkout · …stage the payment retry rollout…"),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Rollout plan"));

    expect(m.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: {
        workspaceId: "workspace",
        projectId: "project",
        taskId: "feature",
      },
      search: { featureTab: "documents", featureDocumentId: "document" },
    });
  });
});
