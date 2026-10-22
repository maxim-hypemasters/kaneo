import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { MilestonePicker } from "./milestone-picker";
const queries = vi.hoisted(() => ({
  milestones: [] as { id: string; title: string; releaseId: string | null }[],
  releases: undefined as { id: string; name: string }[] | undefined,
  error: null as Error | null,
  readReleases: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/milestone/use-get-milestones", () => ({
  useGetMilestones: () => ({
    data: queries.milestones,
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: (projectId: string, options: unknown) => {
    queries.readReleases(projectId, options);
    return { data: queries.releases, error: queries.error };
  },
}));
beforeEach(() => {
  queries.milestones = [{ id: "m1", title: "Alpha", releaseId: null }];
  queries.releases = undefined;
  queries.error = null;
  queries.readReleases.mockClear();
});
afterEach(cleanup);
describe("Milestone picker", () => {
  it("offers same-feature milestones and explicit clearing", async () => {
    const onChange = vi.fn();
    render(
      <MilestonePicker
        projectId="p"
        featureId="f"
        value="m1"
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.property: Alpha" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "tasks:milestones.none" }),
    );
    expect(onChange).toHaveBeenCalledWith(null);
  });
  it("supports selecting by keyboard", async () => {
    queries.milestones[0].releaseId = "r1";
    queries.releases = [{ id: "r1", name: "0.71" }];
    const onChange = vi.fn();
    render(
      <MilestonePicker
        projectId="p"
        featureId="f"
        value={null}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const option = await screen.findByRole("menuitem", {
      name: "Alpha · 0.71",
    });
    option.focus();
    fireEvent.keyDown(option, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("m1");
  });

  it("shows each milestone's release without changing the selected chip or unassigned rows", async () => {
    queries.milestones = [
      { id: "m1", title: "Alpha", releaseId: "r1" },
      { id: "m2", title: "Alpha", releaseId: "r2" },
      { id: "m3", title: "Unassigned", releaseId: null },
      { id: "m4", title: "Unavailable", releaseId: "missing" },
    ];
    queries.releases = [
      { id: "r1", name: "0.71" },
      { id: "r2", name: "0.72" },
    ];
    const onChange = vi.fn();
    render(
      <MilestonePicker
        projectId="p"
        featureId="f"
        value="m1"
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "tasks:milestones.property: Alpha",
    });
    expect(trigger).not.toHaveTextContent("0.71");
    fireEvent.click(trigger);
    expect(
      await screen.findByRole("menuitem", { name: "Alpha · 0.71" }),
    ).toBeInTheDocument();
    const other = screen.getByRole("menuitem", { name: "Alpha · 0.72" });
    expect(
      screen.getByRole("menuitem", { name: "Unassigned" }),
    ).not.toHaveTextContent("·");
    expect(
      screen.getByRole("menuitem", { name: "Unavailable" }),
    ).not.toHaveTextContent("·");
    expect(
      screen.getByRole("menuitem", { name: "tasks:milestones.none" }),
    ).not.toHaveTextContent("·");
    expect(screen.getByTitle("0.71")).toBeInTheDocument();
    fireEvent.click(other);
    expect(onChange).toHaveBeenCalledWith("m2");
  });

  it.each(["loading", "failure", "unauthorized", "forbidden"])(
    "keeps milestones selectable when release names are %s",
    async (state) => {
      queries.milestones[0].releaseId = "r1";
      if (state === "failure") queries.error = new Error("Offline");
      if (state === "unauthorized" || state === "forbidden") {
        queries.releases = [{ id: "r1", name: "Cached release" }];
        queries.error = new HttpError(
          state === "unauthorized" ? 401 : 403,
          "No access",
        );
      }
      const onChange = vi.fn();
      render(
        <MilestonePicker
          projectId="p"
          featureId="f"
          value={null}
          onChange={onChange}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const option = await screen.findByRole("menuitem", { name: "Alpha" });
      expect(option).not.toHaveTextContent("·");
      expect(screen.queryByText("Cached release")).not.toBeInTheDocument();
      fireEvent.click(option);
      expect(onChange).toHaveBeenCalledWith("m1");
    },
  );

  it("uses the shared project query only while assigned release names are needed", () => {
    queries.milestones[0].releaseId = "r1";
    render(
      <MilestonePicker
        projectId="p"
        featureId="f"
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(queries.readReleases).toHaveBeenLastCalledWith(
      "p",
      expect.objectContaining({ enabled: false }),
    );
    fireEvent.click(screen.getByRole("button"));
    expect(queries.readReleases).toHaveBeenLastCalledWith(
      "p",
      expect.objectContaining({ enabled: true }),
    );
  });

  it("does not request releases for unassigned milestones", () => {
    render(
      <MilestonePicker
        projectId="p"
        featureId="f"
        value={null}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(queries.readReleases).toHaveBeenLastCalledWith(
      "p",
      expect.objectContaining({ enabled: false }),
    );
  });

  it("updates visible release names after a refresh", async () => {
    queries.milestones[0].releaseId = "r1";
    queries.releases = [{ id: "r1", name: "0.71" }];
    const view = (
      <MilestonePicker
        projectId="p"
        featureId="f"
        value={null}
        onChange={vi.fn()}
      />
    );
    const { rerender } = render(view);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByRole("menuitem", { name: "Alpha · 0.71" });
    queries.releases = [{ id: "r1", name: "0.72" }];
    rerender(
      <MilestonePicker
        projectId="p"
        featureId="f"
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("menuitem", { name: "Alpha · 0.72" }),
    ).toBeInTheDocument();
  });
});
