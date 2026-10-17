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
import { FeaturePickerChip } from "./feature-picker-chip";
import type { FeatureChoice } from "./feature-picker-options";

const m = vi.hoisted(() => ({
  features: undefined as unknown[] | undefined,
  isPending: false,
  requested: [] as (string | undefined)[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) =>
      values?.name ? `${key}:${values.name}` : key,
  }),
}));
vi.mock("@/hooks/queries/task/use-get-project-features", () => ({
  useGetProjectFeatures: (projectId: string | undefined) => {
    m.requested.push(projectId);
    return { data: m.features, isPending: m.isPending };
  },
}));

beforeEach(() => {
  m.features = [
    { id: "checkout", title: "Checkout", number: 3, status: "to-do" },
    { id: "legacy", title: "Legacy", number: 1, status: "archived" },
  ];
  m.isPending = false;
  m.requested = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderChip(
  value: FeatureChoice | null = null,
  projectId = "project-1",
) {
  const onChange = vi.fn();
  render(
    <FeaturePickerChip
      projectId={projectId}
      projectSlug="WEB"
      value={value}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button"));
  return onChange;
}

const search = (text: string) =>
  fireEvent.change(
    screen.getByPlaceholderText("common:modals.createTask.searchFeatures"),
    { target: { value: text } },
  );

describe("FeaturePickerChip", () => {
  it("asks for a project before listing features", async () => {
    renderChip(null, "");

    expect(
      await screen.findByText(
        "common:modals.createTask.chooseProjectForFeature",
      ),
    ).toBeInTheDocument();
    expect(m.requested).toEqual([]);
  });

  it("lists no feature and the project's features that aren't archived", async () => {
    renderChip();

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringMatching(/^common:modals.createTask.noFeature/),
      expect.stringMatching(/^CheckoutWEB-3/),
    ]);
    expect(m.requested).toContain("project-1");
  });

  it("picks a feature with the keyboard", async () => {
    const onChange = renderChip();

    search("chec");
    await act(async () => {
      fireEvent.keyDown(
        screen.getByPlaceholderText("common:modals.createTask.searchFeatures"),
        { key: "Enter" },
      );
    });

    expect(onChange).toHaveBeenCalledWith({
      kind: "existing",
      id: "checkout",
      title: "Checkout",
    });
  });

  it("offers to create a feature named after the search", async () => {
    const onChange = renderChip();

    search("Payments");
    expect(
      screen.getByText("common:modals.createTask.noFeaturesFound"),
    ).toHaveAttribute("role", "status");
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("option", {
          name: /createFeature:Payments/,
        }),
      );
    });

    expect(onChange).toHaveBeenCalledWith({ kind: "new", title: "Payments" });
  });

  it("starts with an empty search and fresh features each time it opens", async () => {
    renderChip();
    search("Pay");
    const trigger = screen.getByRole("button", {
      name: "common:modals.createTask.feature",
    });

    await act(async () => {
      fireEvent.click(trigger);
    });
    expect(
      screen.queryByPlaceholderText("common:modals.createTask.searchFeatures"),
    ).toBeNull();
    m.features = [
      ...(m.features ?? []),
      { id: "search", title: "Search", number: 4, status: "to-do" },
    ];
    fireEvent.click(trigger);

    expect(
      await screen.findByPlaceholderText(
        "common:modals.createTask.searchFeatures",
      ),
    ).toHaveValue("");
    expect(
      screen.getByRole("option", { name: /^SearchWEB-4/ }),
    ).toBeInTheDocument();
  });

  it("shows a chosen new feature as new", () => {
    render(
      <FeaturePickerChip
        projectId="project-1"
        projectSlug="WEB"
        value={{ kind: "new", title: "Payments" }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "common:modals.createTask.feature common:modals.createTask.newFeatureSuffix:Payments",
      }),
    ).toBeInTheDocument();
  });

  it("takes the task out of its feature", async () => {
    const onChange = renderChip({
      kind: "existing",
      id: "checkout",
      title: "Checkout",
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("option", { name: /noFeature/ }));
    });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("says while features load, then when none are found", async () => {
    m.isPending = true;
    m.features = undefined;
    renderChip();

    expect(
      await screen.findByText("common:modals.createTask.loadingFeatures"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();

    cleanup();
    m.isPending = false;
    m.features = [];
    renderChip();

    expect(
      await screen.findByText("common:modals.createTask.noFeaturesFound"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /noFeature/ }),
    ).toBeInTheDocument();
  });
});
