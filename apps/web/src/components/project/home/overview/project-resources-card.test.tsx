import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ProjectLink } from "@/fetchers/project-link/types";
import { toast } from "@/lib/toast";
import { ProjectResourcesCard } from "./project-resources-card";

const m = vi.hoisted(() => ({
  links: [] as ProjectLink[] | undefined,
  isError: false,
  canEdit: true,
  deleteLink: vi.fn(async (_id: string) => ({})),
  reorderLinks: vi.fn(async (_links: unknown) => []),
  move: (_from: number, _to: number) => {},
}));

function link(id: string, title: string, url: string): ProjectLink {
  return {
    id,
    projectId: "p1",
    title,
    url,
    position: 0,
    createdAt: "2026-11-25T00:00:00.000Z",
  };
}

vi.mock("@/hooks/queries/project-link/use-project-links", () => ({
  useProjectLinks: () => ({
    data: m.links,
    isPending: m.links === undefined && !m.isError,
    isError: m.isError,
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canEditProjectDetails: () => m.canEdit,
    isCheckingPermissions: false,
  }),
}));
vi.mock("@/hooks/mutations/project-link/use-delete-project-link", () => ({
  useDeleteProjectLink: () => ({ mutateAsync: m.deleteLink, isPending: false }),
}));
vi.mock("@/hooks/mutations/project-link/use-reorder-project-links", () => ({
  useReorderProjectLinks: () => ({ mutateAsync: m.reorderLinks }),
}));
// Dragging needs real layout; the list hands its move callback to the test.
vi.mock("@/components/project/sortable/sortable-list", async (original) => {
  const actual =
    await original<
      typeof import("@/components/project/sortable/sortable-list")
    >();
  return {
    SortableList: (props: Parameters<typeof actual.SortableList>[0]) => {
      m.move = props.onMove;
      return <actual.SortableList {...props} />;
    },
  };
});
vi.mock("./project-resource-dialog", () => ({
  ProjectResourceDialog: ({
    open,
    link: editing,
  }: {
    open: boolean;
    link: ProjectLink | null;
  }) => (open ? <div role="dialog">{editing?.title ?? "new link"}</div> : null),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.title ? `${key}:${options.title}` : key,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const key = (name: string) => `tasks:projectHome.resources.${name}`;

async function chooseFromMenu(title: string, item: string) {
  fireEvent.click(
    screen.getByRole("button", { name: `${key("actions")}:${title}` }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

beforeEach(() => {
  m.canEdit = true;
  m.isError = false;
  m.links = [
    link("l1", "Spec", "https://docs.example.com/spec"),
    link("l2", "Design file", "https://www.figma.com/file/abc"),
    link("l3", "Staging", "https://staging.example.com"),
  ];
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("project resources card", () => {
  it("lists links in order, each opening in a new tab, with Add link last", () => {
    render(<ProjectResourcesCard projectId="p1" />);
    const links = screen.getAllByRole("link");
    expect(links.map((item) => item.textContent)).toEqual([
      "Specdocs.example.com",
      "Design filefigma.com",
      "Stagingstaging.example.com",
    ]);
    expect(links[1]?.getAttribute("href")).toBe(
      "https://www.figma.com/file/abc",
    );
    for (const item of links) {
      expect(item.getAttribute("target")).toBe("_blank");
      expect(item.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(screen.getAllByRole("button").at(-1)?.textContent).toContain(
      key("add"),
    );
  });

  it("is read-only without project:edit_details", () => {
    m.canEdit = false;
    render(<ProjectResourcesCard projectId="p1" />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when there are no links, and offers editors only Add link", () => {
    m.links = [];
    m.canEdit = false;
    const { unmount } = render(<ProjectResourcesCard projectId="p1" />);
    expect(screen.getByText(key("none"))).toBeTruthy();
    unmount();

    m.canEdit = true;
    render(<ProjectResourcesCard projectId="p1" />);
    expect(screen.queryByText(key("none"))).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("says when the links could not be loaded", () => {
    m.links = undefined;
    m.isError = true;
    render(<ProjectResourcesCard projectId="p1" />);
    expect(screen.getByText(key("loadError"))).toBeTruthy();
  });

  it("opens the dialog for a new link and for the link being edited", async () => {
    render(<ProjectResourcesCard projectId="p1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: key("add") }));
    expect(screen.getByRole("dialog").textContent).toBe("new link");

    await chooseFromMenu("Design file", key("edit"));
    expect(screen.getByRole("dialog").textContent).toBe("Design file");
  });

  it("removes a link from its menu, and reports a refusal", async () => {
    render(<ProjectResourcesCard projectId="p1" />);
    await chooseFromMenu("Spec", "common:actions.remove");
    expect(m.deleteLink).toHaveBeenCalledWith("l1");

    m.deleteLink.mockRejectedValueOnce(new Error("Link not found"));
    await chooseFromMenu("Staging", "common:actions.remove");
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Link not found"),
    );
  });

  it("saves the whole new order after a drag", async () => {
    render(<ProjectResourcesCard projectId="p1" />);
    await act(async () => m.move(0, 2));
    expect(m.reorderLinks).toHaveBeenCalledWith([
      { id: "l2", position: 0 },
      { id: "l3", position: 1 },
      { id: "l1", position: 2 },
    ]);
  });
});
