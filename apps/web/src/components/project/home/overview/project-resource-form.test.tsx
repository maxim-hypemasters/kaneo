import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { ProjectResourceDialog } from "./project-resource-dialog";

const m = vi.hoisted(() => ({
  createLink: vi.fn(async (_link: unknown) => ({})),
  updateLink: vi.fn(async (_link: unknown) => ({})),
}));

vi.mock("@/hooks/mutations/project-link/use-create-project-link", () => ({
  useCreateProjectLink: () => ({ mutateAsync: m.createLink, isPending: false }),
}));
vi.mock("@/hooks/mutations/project-link/use-update-project-link", () => ({
  useUpdateProjectLink: () => ({ mutateAsync: m.updateLink, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const key = (name: string) => `tasks:projectHome.resources.${name}`;

const spec: ProjectLink = {
  id: "l1",
  projectId: "p1",
  title: "Spec",
  url: "https://docs.example.com/spec",
  position: 0,
  createdAt: "2026-11-25T00:00:00.000Z",
};

function renderDialog(link: ProjectLink | null = null) {
  const onOpenChange = vi.fn();
  render(
    <ProjectResourceDialog
      open
      onOpenChange={onOpenChange}
      link={link}
      projectId="p1"
    />,
  );
  return { onOpenChange };
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(key(label)), { target: { value } });
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("project resource form", () => {
  it("adds a link, completing an address typed without https", async () => {
    const { onOpenChange } = renderDialog();
    fill("url", " figma.com/file/abc ");
    fill("linkTitle", "  Design file ");
    fireEvent.click(screen.getByRole("button", { name: key("add") }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(m.createLink).toHaveBeenCalledWith({
      url: "https://figma.com/file/abc",
      title: "Design file",
    });
    expect(m.updateLink).not.toHaveBeenCalled();
  });

  it("asks for a web address and a title before saving", () => {
    const { onOpenChange } = renderDialog();
    fill("url", "javascript:alert(1)");
    fireEvent.click(screen.getByRole("button", { name: key("add") }));

    expect(screen.getByText(key("invalidUrl"))).toBeTruthy();
    expect(screen.getByText(key("titleRequired"))).toBeTruthy();
    expect(m.createLink).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    fill("url", "https://example.com");
    expect(screen.queryByText(key("invalidUrl"))).toBeNull();
  });

  it("edits the link it was opened for", async () => {
    const { onOpenChange } = renderDialog(spec);
    expect((screen.getByLabelText(key("url")) as HTMLInputElement).value).toBe(
      spec.url,
    );
    fill("linkTitle", "Product spec");
    fireEvent.click(screen.getByRole("button", { name: key("save") }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(m.updateLink).toHaveBeenCalledWith({
      id: "l1",
      url: spec.url,
      title: "Product spec",
    });
    expect(m.createLink).not.toHaveBeenCalled();
  });

  it("stays open and shows the reason when a save is refused", async () => {
    m.createLink.mockRejectedValueOnce(
      new Error("A project can have at most 100 links"),
    );
    const { onOpenChange } = renderDialog();
    fill("url", "https://example.com");
    fill("linkTitle", "One too many");
    fireEvent.click(screen.getByRole("button", { name: key("add") }));

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "A project can have at most 100 links",
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
