import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { useOpenProject } from "./use-open-project";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem("user-preferences");
  useUserPreferencesStore.setState({
    defaultProjectView: "gantt",
    viewMode: "board",
  });
});

function openProject() {
  const { result } = renderHook(() => useOpenProject());
  result.current("w", "p");
}

it("opens the default view directly instead of the index redirect", () => {
  openProject();

  expect(navigate).toHaveBeenCalledWith({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
    params: { workspaceId: "w", projectId: "p" },
  });
});

it("opens a list default on the board route in list mode", () => {
  useUserPreferencesStore.setState({ defaultProjectView: "list" });

  openProject();

  expect(navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
    }),
  );
  expect(useUserPreferencesStore.getState().viewMode).toBe("list");
});
