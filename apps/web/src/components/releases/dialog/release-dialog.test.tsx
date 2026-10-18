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
import { HttpError } from "@/lib/http-error";
import type { Release } from "@/types/release";
import { ReleaseDialog } from "./release-dialog";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  releases: [] as unknown[],
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (options?.start) return `${key} ${options.start} – ${options.end}`;
      return options?.date ? `${key} ${options.date}` : key;
    },
  }),
}));
vi.mock("@/hooks/mutations/release/use-create-release", () => ({
  useCreateRelease: () => ({ mutateAsync: m.create, isPending: false }),
}));
vi.mock("@/hooks/mutations/release/use-update-release", () => ({
  useUpdateRelease: () => ({ mutateAsync: m.update, isPending: false }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({ data: m.releases, isPending: false }),
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-10-17",
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const release: Release = {
  id: "r1",
  projectId: "project-1",
  name: "2.4",
  description: "Checkout",
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progress: {
    tasks: { total: 0, completed: 0 },
    features: { total: 0, completed: 0 },
    unfinished: 0,
  },
};

function renderDialog(current: Release | null) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <ReleaseDialog
      open
      onOpenChange={onOpenChange}
      projectId="project-1"
      release={current}
      onCreated={onCreated}
    />,
  );
  return { onOpenChange, onCreated };
}

async function submit(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: label }));
  });
}

beforeEach(() => {
  m.releases = [release];
  m.create.mockReset().mockResolvedValue({ ...release, id: "r2" });
  m.update.mockReset().mockResolvedValue(release);
  m.success.mockReset();
  m.error.mockReset();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("ReleaseDialog", () => {
  it("suggests the next release's dates and creates it", async () => {
    const { onOpenChange, onCreated } = renderDialog(null);

    expect(
      screen.getByRole("button", {
        name: /tasks:releases\.dialog\.startLabel Oct 21/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /tasks:releases\.dialog\.codeFreezeLabel Nov 4/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /tasks:releases\.dialog\.submissionLabel Nov 9/,
      }),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", { name: "tasks:releases.dialog.nameLabel" }),
      { target: { value: "  2.5  " } },
    );
    await submit("tasks:releases.dialog.create");

    expect(m.create).toHaveBeenCalledWith({
      projectId: "project-1",
      data: {
        name: "2.5",
        description: null,
        startDate: "2026-10-21",
        codeFreezeDate: "2026-11-04",
        submissionDate: "2026-11-09",
      },
    });
    expect(m.success).toHaveBeenCalledWith(
      "tasks:releases.dialog.createSuccess",
      expect.anything(),
    );
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r2" }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks for a name before creating", async () => {
    renderDialog(null);

    await submit("tasks:releases.dialog.create");

    const name = screen.getByRole("textbox", {
      name: "tasks:releases.dialog.nameLabel",
    });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(
      "tasks:releases.dialog.nameRequired",
    );
    expect(m.create).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: "2.5" } });
    expect(name).not.toHaveAttribute("aria-invalid");
  });

  it("asks for every date of a project's first release", async () => {
    m.releases = [];
    renderDialog(null);

    fireEvent.change(
      screen.getByRole("textbox", { name: "tasks:releases.dialog.nameLabel" }),
      { target: { value: "1.0" } },
    );
    await submit("tasks:releases.dialog.create");

    expect(
      screen.getAllByText("tasks:releases.dialog.dateRequired"),
    ).toHaveLength(3);
    expect(
      screen.getByRole("button", {
        name: /tasks:releases\.dialog\.startLabel tasks:releases\.dialog\.pickDate/,
      }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("edits a release, clearing an emptied description", async () => {
    const { onOpenChange } = renderDialog(release);

    expect(
      screen.getByRole("textbox", { name: "tasks:releases.dialog.nameLabel" }),
    ).toHaveValue("2.4");
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "tasks:releases.dialog.descriptionLabel",
      }),
      { target: { value: "   " } },
    );
    await submit("tasks:releases.dialog.save");

    expect(m.update).toHaveBeenCalledWith({
      id: "r1",
      projectId: "project-1",
      data: {
        name: "2.4",
        description: null,
        startDate: "2026-10-01",
        codeFreezeDate: "2026-10-15",
        submissionDate: "2026-10-20",
      },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("marks the name taken when the project has a release by that name", async () => {
    m.create.mockRejectedValue(
      new HttpError(
        409,
        "A release with this name already exists in this project",
      ),
    );
    const { onOpenChange } = renderDialog(null);
    const name = screen.getByRole("textbox", {
      name: "tasks:releases.dialog.nameLabel",
    });
    fireEvent.change(name, { target: { value: "2.4" } });

    await submit("tasks:releases.dialog.create");

    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("tasks:releases.ux.nameTaken");
    expect(name).toHaveFocus();
    expect(m.error).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: "2.5" } });
    expect(name).not.toHaveAttribute("aria-invalid");
  });

  it("shows the server's reason when saving fails otherwise", async () => {
    m.update.mockRejectedValue(new HttpError(500, "Internal Server Error"));
    const { onOpenChange } = renderDialog(release);

    await submit("tasks:releases.dialog.save");

    expect(m.error).toHaveBeenCalledWith("Internal Server Error");
    expect(
      screen.getByRole("textbox", { name: "tasks:releases.dialog.nameLabel" }),
    ).not.toHaveAttribute("aria-invalid");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

function openPicker(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByPlaceholderText("tasks:datePicker.datePlaceholder");
}

function typeDay(input: HTMLElement, day: string) {
  fireEvent.change(input, { target: { value: day } });
}

function dayCell(day: string) {
  const cell = document.querySelector(`[data-day="${day}"]`);
  if (!cell) throw new Error(`no ${day} in the month grid`);
  return cell;
}

// The release runs Oct 1 → code freeze Oct 15 → submission Oct 20.
describe("ReleaseDialog date bounds", () => {
  it("holds the code freeze between the start and the submission", () => {
    renderDialog(release);

    const input = openPicker(/tasks:releases\.dialog\.codeFreezeLabel Oct 15/);

    expect(
      screen.getByText(
        /^tasks:releases\.dialog\.limitHint \w+, Oct 1 – \w+, Oct 20$/,
      ),
    ).toBeInTheDocument();
    typeDay(input, "2026-09-30");
    expect(
      screen.getByText(/^tasks:releases\.dialog\.beforeStart \w+, Sep 30$/),
    ).toBeInTheDocument();
    typeDay(input, "2026-10-21");
    expect(
      screen.getByText(/^tasks:releases\.dialog\.afterSubmission \w+, Oct 21$/),
    ).toBeInTheDocument();

    typeDay(input, "");
    fireEvent.click(
      screen.getByRole("option", { name: /tasks:datePicker\.pickDate/ }),
    );
    expect(dayCell("2026-09-30")).toHaveAttribute("data-disabled");
    expect(dayCell("2026-10-01")).not.toHaveAttribute("data-disabled");
    expect(dayCell("2026-10-20")).not.toHaveAttribute("data-disabled");
    expect(dayCell("2026-10-21")).toHaveAttribute("data-disabled");
  });

  it("keeps the start on or before the code freeze", () => {
    renderDialog(release);

    const input = openPicker(/tasks:releases\.dialog\.startLabel Oct 1/);

    expect(
      screen.getByText(
        /^tasks:releases\.pages\.limit\.codeFreeze \w+, Oct 15$/,
      ),
    ).toBeInTheDocument();
    typeDay(input, "2026-10-16");
    expect(
      screen.getByText(/^tasks:releases\.dialog\.afterCodeFreeze \w+, Oct 16$/),
    ).toBeInTheDocument();
  });

  it("keeps the submission on or after the code freeze", () => {
    renderDialog(release);

    const input = openPicker(/tasks:releases\.dialog\.submissionLabel Oct 20/);

    typeDay(input, "2026-10-14");
    expect(
      screen.getByText(
        /^tasks:releases\.dialog\.beforeCodeFreeze \w+, Oct 14$/,
      ),
    ).toBeInTheDocument();
    typeDay(input, "2026-10-15");
    expect(
      screen.queryByText(/^tasks:releases\.dialog\.beforeCodeFreeze/),
    ).toBeNull();
  });
});
