import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { SidebarProjectItem } from "./sidebar-project-item";

const mocks = vi.hoisted(() => ({
  drag: vi.fn(),
  touchDrag: vi.fn(),
  open: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args: { name: string }) => `${key} ${args.name}`,
  }),
}));
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    listeners: { onMouseDown: mocks.drag, onTouchStart: mocks.touchDrag },
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenuItem: (props: ComponentProps<"li">) => <li {...props} />,
  SidebarMenuButton: ({
    isActive: _active,
    size: _size,
    ...props
  }: ComponentProps<"button"> & { isActive: boolean; size: string }) => (
    <button {...props} />
  ),
}));

function Harness({
  canReorder = true,
  icon = "Layout",
}: {
  canReorder?: boolean;
  icon?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <ul>
      <SidebarProjectItem
        project={{
          id: "p",
          name: "Alpha",
          icon,
          statistics: { completionPercentage: 50 },
        }}
        canReorder={canReorder}
        current
        expanded={expanded}
        onExpandedChange={setExpanded}
        onOpen={mocks.open}
        actions={<button type="button">Project actions</button>}
      >
        <ul>
          <li>
            <a href="/tasks">Tasks</a>
          </li>
        </ul>
      </SidebarProjectItem>
    </ul>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("keeps expansion separate from opening the project and exposes its state", async () => {
  render(<Harness />);
  const expand = screen.getByRole("button", {
    name: "navigation:projectList.expandProject Alpha",
  });
  expect(expand).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link", { name: "Tasks" })).not.toBeInTheDocument();
  fireEvent.click(expand);
  expect(mocks.open).not.toHaveBeenCalled();
  const collapse = screen.getByRole("button", {
    name: "navigation:projectList.collapseProject Alpha",
  });
  expect(collapse).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(collapse).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(collapse);
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: "Tasks" }),
    ).not.toBeInTheDocument(),
  );
});

it("starts drag gestures only on the project header button", () => {
  render(<Harness />);
  const expand = screen.getByRole("button", {
    name: "navigation:projectList.expandProject Alpha",
  });
  fireEvent.mouseDown(expand);
  fireEvent.touchStart(expand);
  fireEvent.click(expand);
  const actions = screen.getByRole("button", { name: "Project actions" });
  const link = screen.getByRole("link", { name: "Tasks" });
  for (const element of [actions, link]) {
    fireEvent.mouseDown(element);
    fireEvent.touchStart(element);
  }
  expect(mocks.drag).not.toHaveBeenCalled();
  expect(mocks.touchDrag).not.toHaveBeenCalled();
  const project = screen.getByRole("button", { name: "Alpha" });
  fireEvent.mouseDown(project);
  fireEvent.touchStart(project);
  expect(mocks.drag).toHaveBeenCalledOnce();
  expect(mocks.touchDrag).toHaveBeenCalledOnce();
});

it("exposes the disclosure as a native keyboard-focusable button", () => {
  render(<Harness />);
  const expand = screen.getByRole("button", {
    name: "navigation:projectList.expandProject Alpha",
  });
  expect(expand.tagName).toBe("BUTTON");
  expect(expand).toHaveAttribute("type", "button");
  expect(expand.tabIndex).toBe(0);
  expand.focus();
  expect(expand).toHaveFocus();
  fireEvent.click(expand);
  expect(expand.getAttribute("aria-controls")).toBeTruthy();
});

it("keeps project navigation available when reorder permission is absent", () => {
  render(<Harness canReorder={false} />);
  const project = screen.getByRole("button", { name: "Alpha" });
  fireEvent.mouseDown(project);
  fireEvent.touchStart(project);
  fireEvent.click(project);
  expect(mocks.drag).not.toHaveBeenCalled();
  expect(mocks.touchDrag).not.toHaveBeenCalled();
  expect(mocks.open).toHaveBeenCalledOnce();
});

it("uses the default project icon for projects without an icon", () => {
  render(<Harness icon={null} />);
  const project = screen.getByRole("button", { name: "Alpha" });
  expect(project.querySelector("svg")).toHaveClass("lucide-layout");
  fireEvent.click(project);
  expect(mocks.open).toHaveBeenCalledOnce();
});
