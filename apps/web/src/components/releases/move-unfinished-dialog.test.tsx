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
import type { Release } from "@/types/release";
import { MoveUnfinishedDialog } from "./move-unfinished-dialog";

const m = vi.hoisted(() => ({
  move: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
vi.mock("@/hooks/mutations/release/use-move-unfinished", () => ({
  useMoveUnfinished: () => ({ mutateAsync: m.move, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const release = (id: string, name: string, startDate: string): Release => ({
  id,
  projectId: "project-1",
  name,
  description: null,
  startDate,
  codeFreezeDate: startDate,
  submissionDate: startDate,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progress: {
    tasks: { total: 0, completed: 0 },
    features: { total: 0, completed: 0 },
    unfinished: 0,
  },
});

const current = release("r1", "2.4", "2026-10-01");
const next = release("r2", "2.5", "2026-11-01");
const later = release("r3", "2.6", "2026-12-01");

function renderDialog(
  props: Partial<Parameters<typeof MoveUnfinishedDialog>[0]> = {},
) {
  const onOpenChange = vi.fn();
  render(
    <MoveUnfinishedDialog
      open
      onOpenChange={onOpenChange}
      release={current}
      releases={[current, later, next]}
      unfinished={3}
      today="2026-10-17"
      {...props}
    />,
  );
  return { onOpenChange };
}

beforeEach(() => {
  m.move.mockReset().mockResolvedValue({ movedTaskIds: ["a", "b", "c"] });
  m.success.mockReset();
  m.error.mockReset();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("MoveUnfinishedDialog", () => {
  it("moves the unfinished items to the next release by default", async () => {
    const { onOpenChange } = renderDialog();

    expect(
      screen.getByRole("combobox", {
        name: "tasks:releases.moveUnfinished.target",
      }),
    ).toHaveTextContent("2.5");
    expect(
      screen.getByText(/tasks:releases\.moveUnfinished\.summary {"count":3}/),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "tasks:releases.moveUnfinished.confirm",
        }),
      );
    });

    expect(m.move).toHaveBeenCalledWith({
      id: "r1",
      projectId: "project-1",
      targetReleaseId: "r2",
    });
    expect(m.success).toHaveBeenCalledWith(
      'tasks:releases.moveUnfinished.success {"count":3,"name":"2.5"}',
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("takes the items out of every release after the last one", async () => {
    renderDialog({ release: later, releases: [current, later] });

    expect(
      screen.getByRole("combobox", {
        name: "tasks:releases.moveUnfinished.target",
      }),
    ).toHaveTextContent("tasks:releases.moveUnfinished.noRelease");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "tasks:releases.moveUnfinished.confirm",
        }),
      );
    });

    expect(m.move).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r3", targetReleaseId: null }),
    );
    expect(m.success).toHaveBeenCalledWith(
      'tasks:releases.moveUnfinished.successNoRelease {"count":3}',
      expect.anything(),
    );
  });

  it("says there are no other releases to pick", () => {
    renderDialog({ releases: [current] });

    expect(
      screen.getByText("tasks:releases.moveUnfinished.noTargets"),
    ).toBeInTheDocument();
  });

  it("has nothing to move when everything is done", () => {
    renderDialog({ unfinished: 0 });

    expect(
      screen.getByText("tasks:releases.moveUnfinished.none"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.moveUnfinished.confirm",
      }),
    ).toBeDisabled();
  });

  it("keeps the dialog open when the move fails", async () => {
    m.move.mockRejectedValue(new Error("Release not found"));
    const { onOpenChange } = renderDialog();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "tasks:releases.moveUnfinished.confirm",
        }),
      );
    });

    expect(m.error).toHaveBeenCalledWith("Release not found");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
