import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { TestCaseComment } from "@/fetchers/test-case/types";
import { TestCaseComments } from "./test-case-comments";

const mocks = vi.hoisted(() => ({
  comments: [] as unknown[],
  canUpdate: true,
  create: vi.fn(async (_content: string) => undefined),
  update: vi.fn(async (_input: unknown) => undefined),
  remove: vi.fn(),
  // A settled mutation that runs `run`.
  mutation: (run: (...args: never[]) => unknown) => () => ({
    mutateAsync: run,
    mutate: run,
    isPending: false,
    isError: false,
    reset: () => {},
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/format", () => ({
  formatRelativeTime: () => "2 hours ago",
  formatDateTime: () => "Nov 25, 2026, 10:00 AM",
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  useDocumentDraftGuard: () => {},
}));
// The real editor is TipTap; a textarea keeps this test on the thread's logic.
vi.mock("@/components/activity/comment-editor", () => ({
  default: (props: {
    value: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
  }) =>
    props.readOnly ? (
      <p>{props.value}</p>
    ) : (
      <textarea
        aria-label={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    ),
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTestCases: () => mocks.canUpdate,
  }),
}));
vi.mock("@/lib/upload-test-case-asset", () => ({
  uploadTestCaseAsset: vi.fn(),
}));
vi.mock("@/hooks/queries/test-case/use-test-case-comments", () => ({
  useTestCaseComments: () => ({
    data: { data: mocks.comments },
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/mutations/test-case/use-create-test-case-comment", () => ({
  useCreateTestCaseComment: mocks.mutation(mocks.create),
}));
vi.mock("@/hooks/mutations/test-case/use-update-test-case-comment", () => ({
  useUpdateTestCaseComment: mocks.mutation(mocks.update),
}));
vi.mock("@/hooks/mutations/test-case/use-delete-test-case-comment", () => ({
  useDeleteTestCaseComment: mocks.mutation(mocks.remove),
}));

const comment = (
  id: string,
  authorId: string | null,
  content: string,
): TestCaseComment => ({
  id,
  testCaseId: "tc",
  content,
  author: authorId ? { id: authorId, name: authorId, image: null } : null,
  createdAt: "2026-11-25T10:00:00.000Z",
  updatedAt: "2026-11-25T10:00:00.000Z",
});

const thread = () => render(<TestCaseComments testCaseId="tc" projectId="p" />);
const card = (text: string) =>
  within(screen.getByText(text).closest("article") as HTMLElement);

beforeEach(() => {
  mocks.canUpdate = true;
  mocks.comments = [
    comment("c1", "me", "Fails on Safari"),
    comment("c2", "ada", "Works for me"),
    comment("c3", null, "From a deleted account"),
  ];
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("TestCaseComments", () => {
  it("lists the comments in order and names a missing author", () => {
    thread();
    expect(
      screen.getAllByRole("article").map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("Fails on Safari"),
      expect.stringContaining("Works for me"),
      expect.stringContaining("common:people.someone"),
    ]);
  });

  it("offers edit and delete only on your own comments", () => {
    thread();
    expect(
      card("Fails on Safari").getByLabelText("activity:comment.edit"),
    ).toBeInTheDocument();
    expect(
      card("Works for me").queryByLabelText("activity:comment.edit"),
    ).toBeNull();
    expect(
      card("Works for me").queryByLabelText("tasks:testCases.comments.delete"),
    ).toBeNull();
  });

  it("posts a comment and clears the box", async () => {
    thread();
    const box = screen.getByLabelText("activity:comment.leavePlaceholder");
    const post = screen.getByLabelText("tasks:testCases.comments.post");
    expect(post).toBeDisabled();
    fireEvent.change(box, { target: { value: "Retested on 17.2" } });
    fireEvent.click(post);
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith("Retested on 17.2"),
    );
    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("saves an edit to your comment", async () => {
    thread();
    fireEvent.click(
      card("Fails on Safari").getByLabelText("activity:comment.edit"),
    );
    fireEvent.change(
      screen.getByLabelText("activity:comment.editPlaceholder"),
      {
        target: { value: "Fails on Safari 17" },
      },
    );
    fireEvent.click(screen.getByText("activity:comment.save"));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        commentId: "c1",
        content: "Fails on Safari 17",
      }),
    );
  });

  it("asks before deleting a comment", () => {
    thread();
    fireEvent.click(
      card("Fails on Safari").getByLabelText("tasks:testCases.comments.delete"),
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("common:actions.delete"));
    expect(mocks.remove).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("is read-only for members who can't update test cases", () => {
    mocks.canUpdate = false;
    thread();
    expect(
      screen.queryByLabelText("activity:comment.leavePlaceholder"),
    ).toBeNull();
    expect(screen.queryByLabelText("activity:comment.edit")).toBeNull();
    expect(screen.getByText("Works for me")).toBeInTheDocument();
  });
});
