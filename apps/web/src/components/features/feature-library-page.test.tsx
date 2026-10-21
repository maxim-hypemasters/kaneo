import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { FeatureLibraryPage } from "./feature-library-page";
const mocks = vi.hoisted(() => ({ read: vi.fn(), archive: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) =>
      options?.title ? `${key} ${options.title}` : key,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/components/common/project-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/fetchers/task/feature-library", () => ({
  getFeatureLibrary: mocks.read,
  archiveFeature: mocks.archive,
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: () => true }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function view() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <FeatureLibraryPage projectId="p" workspaceId="w" />
    </QueryClientProvider>,
  );
  return cache;
}
const page = {
  data: [
    {
      id: "f",
      title: "Battle knowledge",
      description: "Implementation history",
      milestoneCount: 2,
      labels: [],
    },
  ],
  pagination: { total: 1, page: 1, limit: 30, totalPages: 1 },
};
describe("Feature library", () => {
  it("lists knowledge metadata without execution planning", async () => {
    mocks.read.mockResolvedValue(page);
    view();
    expect(await screen.findByText("Battle knowledge")).toBeInTheDocument();
    expect(screen.getByText("Implementation history")).toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledWith("p", "", false, 1);
    expect(screen.queryByText("tasks:status.label")).not.toBeInTheDocument();
  });
  it("searches and switches independently to archived Features", async () => {
    mocks.read.mockResolvedValue(page);
    view();
    await screen.findByText("Battle knowledge");
    fireEvent.change(
      screen.getByPlaceholderText("tasks:features.library.search"),
      { target: { value: "Battle" } },
    );
    await waitFor(() =>
      expect(mocks.read).toHaveBeenCalledWith("p", "Battle", false, 1),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:features.library.archived" }),
    );
    await waitFor(() =>
      expect(mocks.read).toHaveBeenCalledWith("p", "Battle", true, 1),
    );
  });
  it("only archives after confirmation and refreshes Feature caches", async () => {
    mocks.read.mockResolvedValue(page);
    mocks.archive.mockResolvedValue({});
    const cache = view();
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "tasks:features.library.archive",
      }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "tasks:features.library.archiveDialogTitle Battle knowledge",
    });
    expect(mocks.archive).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "tasks:features.library.archive",
      }),
    );
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith("f", true));
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["project-features", "p"],
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["feature-library", "p"],
    });
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
  it("cancels without archiving the Feature", async () => {
    mocks.read.mockResolvedValue(page);
    view();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "tasks:features.library.archive",
      }),
    );
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "common:actions.cancel",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(screen.getByText("Battle knowledge")).toBeInTheDocument();
  });
  it("restores archived Features without an archive confirmation", async () => {
    mocks.read.mockResolvedValue(page);
    mocks.archive.mockResolvedValue({});
    view();
    await screen.findByText("Battle knowledge");
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:features.library.archived" }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "tasks:features.library.restore",
      }),
    );
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith("f", false));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("keeps failed archive confirmation open for retry", async () => {
    mocks.read.mockResolvedValue(page);
    mocks.archive
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({});
    view();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "tasks:features.library.archive",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "tasks:features.library.archive",
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(dialog).toBeInTheDocument();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
  it("keeps a retry action for unavailable knowledge records", async () => {
    mocks.read
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(page);
    view();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(await screen.findByText("Battle knowledge")).toBeInTheDocument();
  });
});
