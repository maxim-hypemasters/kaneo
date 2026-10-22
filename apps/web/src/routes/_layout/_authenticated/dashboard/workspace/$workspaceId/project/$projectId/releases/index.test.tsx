import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ComponentType } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ReleaseView } from "@/lib/releases/release-view";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { Route } from "./index";

const m = vi.hoisted(() => ({
  params: { workspaceId: "w", projectId: "p" },
  search: {} as { view?: ReleaseView },
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    ...(options as object),
    useParams: () => m.params,
    useSearch: () => m.search,
    useNavigate: () => m.navigate,
  }),
}));

vi.mock("@/components/releases/list/release-list-page", () => ({
  ReleaseListPage: ({
    view,
    onViewChange,
  }: {
    view: ReleaseView;
    onViewChange: (view: ReleaseView) => void;
  }) => (
    <div>
      <span data-testid="view">{view}</span>
      <button type="button" onClick={() => onViewChange("overview")}>
        Overview
      </button>
      <button type="button" onClick={() => onViewChange("masterplanning")}>
        Masterplanning
      </button>
    </div>
  ),
}));

const route = Route as unknown as {
  component: ComponentType;
  validateSearch: (search: Record<string, unknown>) => { view?: ReleaseView };
};
const Page = route.component;

beforeEach(() => {
  m.params = { workspaceId: "w", projectId: "p" };
  m.search = {};
  m.navigate.mockReset();
  useUserPreferencesStore.setState({ releaseViews: {} });
});

afterEach(() => {
  cleanup();
  useUserPreferencesStore.setState({ releaseViews: {} });
  localStorage.removeItem("user-preferences");
});

describe("release view routing", () => {
  it("accepts only the two supported view search values", () => {
    expect(route.validateSearch({ view: "overview" })).toEqual({
      view: "overview",
    });
    expect(route.validateSearch({ view: "masterplanning" })).toEqual({
      view: "masterplanning",
    });
    expect(route.validateSearch({ view: "gantt" })).toEqual({
      view: undefined,
    });
    expect(route.validateSearch({ view: ["masterplanning"] })).toEqual({
      view: undefined,
    });
    expect(route.validateSearch({})).toEqual({ view: undefined });
  });

  it("defaults to Overview and normalizes its first URL without adding history", () => {
    render(<Page />);
    expect(screen.getByTestId("view")).toHaveTextContent("overview");
    expect(m.navigate).toHaveBeenCalledExactlyOnceWith({
      search: { view: "overview" },
      replace: true,
    });
  });

  it("uses the remembered project view when no URL view is supplied", () => {
    useUserPreferencesStore
      .getState()
      .setReleaseView("w", "p", "masterplanning");
    render(<Page />);
    expect(screen.getByTestId("view")).toHaveTextContent("masterplanning");
    expect(m.navigate).toHaveBeenCalledWith({
      search: { view: "masterplanning" },
      replace: true,
    });
  });

  it("gives an explicit URL precedence and remembers it", () => {
    useUserPreferencesStore
      .getState()
      .setReleaseView("w", "p", "masterplanning");
    m.search = { view: "overview" };
    render(<Page />);
    expect(screen.getByTestId("view")).toHaveTextContent("overview");
    expect(useUserPreferencesStore.getState().releaseViews['["w","p"]']).toBe(
      "overview",
    );
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("pushes view switches and follows back/forward URL changes", () => {
    m.search = { view: "overview" };
    const { rerender } = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Masterplanning" }));
    expect(m.navigate).toHaveBeenCalledExactlyOnceWith({
      search: { view: "masterplanning" },
    });

    m.search = { view: "masterplanning" };
    rerender(<Page />);
    expect(screen.getByTestId("view")).toHaveTextContent("masterplanning");
    expect(useUserPreferencesStore.getState().releaseViews['["w","p"]']).toBe(
      "masterplanning",
    );

    m.search = { view: "overview" };
    rerender(<Page />);
    expect(screen.getByTestId("view")).toHaveTextContent("overview");

    m.search = { view: "masterplanning" };
    rerender(<Page />);
    expect(screen.getByTestId("view")).toHaveTextContent("masterplanning");
  });

  it("resolves another project independently without carrying the previous view", () => {
    m.search = { view: "masterplanning" };
    const { rerender } = render(<Page />);
    act(() => {
      m.params = { workspaceId: "w", projectId: "other" };
      m.search = {};
    });
    rerender(<Page />);
    expect(screen.getByTestId("view")).toHaveTextContent("overview");
    expect(useUserPreferencesStore.getState().releaseViews['["w","p"]']).toBe(
      "masterplanning",
    );
  });
});
