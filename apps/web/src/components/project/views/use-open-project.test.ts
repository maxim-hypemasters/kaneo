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

it("opens the project's home page whatever the default view is", () => {
  useUserPreferencesStore.setState({ defaultProjectView: "list" });
  const { result } = renderHook(() => useOpenProject());

  result.current("w", "p");

  expect(navigate).toHaveBeenCalledWith({
    to: "/dashboard/workspace/$workspaceId/project/$projectId",
    params: { workspaceId: "w", projectId: "p" },
  });
  expect(useUserPreferencesStore.getState().viewMode).toBe("board");
});
