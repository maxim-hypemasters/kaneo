import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { FeatureIssuesToolbar } from "./feature-issues-toolbar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);

const actions = () => ({
  onSearch: vi.fn(),
  onArchived: vi.fn(),
  onCreate: vi.fn(),
  onLink: vi.fn(),
  onClearSelection: vi.fn(),
});

it.each([
  [true, false],
  [false, true],
  [true, true],
])(
  "gates creation and existing linking independently",
  async (canCreate, canEdit) => {
    const callbacks = actions();
    render(
      <FeatureIssuesToolbar
        search=""
        archived={false}
        selectedCount={0}
        createTypes={canCreate ? ["task", "bug"] : []}
        canEdit={canEdit}
        {...callbacks}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:createMenu.new" }),
    );
    await screen.findByRole("menu");
    expect(
      Boolean(
        screen.queryByRole("menuitem", { name: "tasks:createMenu.newTask" }),
      ),
    ).toBe(canCreate);
    expect(
      Boolean(
        screen.queryByRole("menuitem", { name: "tasks:createMenu.newBug" }),
      ),
    ).toBe(canCreate);
    expect(
      Boolean(
        screen.queryByRole("menuitem", {
          name: "tasks:features.workspace.issues.linkExisting",
        }),
      ),
    ).toBe(canEdit);
    expect(
      screen.queryByRole("menuitem", { name: "tasks:createMenu.newFeature" }),
    ).toBeNull();
  },
);

it("offers only the kinds of work the role can create", async () => {
  render(
    <FeatureIssuesToolbar
      search=""
      archived={false}
      selectedCount={0}
      createTypes={["bug"]}
      canEdit={false}
      {...actions()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "tasks:createMenu.new" }));
  await screen.findByRole("menu");
  expect(
    screen.queryByRole("menuitem", { name: "tasks:createMenu.newTask" }),
  ).toBeNull();
  expect(
    screen.getByRole("menuitem", { name: "tasks:createMenu.newBug" }),
  ).toBeTruthy();
});

it("keeps browse filters available without mutation permission and supports clearing selection", async () => {
  const callbacks = actions();
  render(
    <FeatureIssuesToolbar
      search=""
      archived={false}
      selectedCount={2}
      createTypes={[]}
      canEdit={false}
      {...callbacks}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "tasks:createMenu.new" }),
  ).toBeNull();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "A" } });
  expect(callbacks.onSearch).toHaveBeenCalledWith("A");
  fireEvent.click(screen.getByRole("checkbox"));
  expect(callbacks.onArchived).toHaveBeenCalledWith(true);
  fireEvent.click(
    screen.getByRole("button", {
      name: "tasks:features.workspace.issues.clearSelection",
    }),
  );
  expect(callbacks.onClearSelection).toHaveBeenCalledOnce();
});
