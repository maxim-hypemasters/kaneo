import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ApprovalBatchBar } from "./approval-batch-bar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "count" in options ? `${key}[${options.count}]` : key,
  }),
}));

afterEach(cleanup);

describe("ApprovalBatchBar", () => {
  it("stays hidden for a single waiting change", () => {
    const { container } = render(
      <ApprovalBatchBar
        count={1}
        disabled={false}
        deciding={null}
        onDecideAll={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("decides every waiting change at once", () => {
    const onDecideAll = vi.fn();
    render(
      <ApprovalBatchBar
        count={3}
        disabled={false}
        deciding={null}
        onDecideAll={onDecideAll}
      />,
    );
    expect(
      screen.getByRole("group", {
        name: "workspace:assistant.proposal.batch.waiting[3]",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace:assistant.proposal.batch.approveAll",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace:assistant.proposal.batch.rejectAll",
      }),
    );
    expect(onDecideAll.mock.calls).toEqual([[true], [false]]);
  });

  it("shows which batch decision is on its way", () => {
    render(
      <ApprovalBatchBar
        count={2}
        disabled
        deciding={false}
        onDecideAll={vi.fn()}
      />,
    );
    // A loading button's name ends with its spinner's.
    const reject = screen.getByRole("button", {
      name: /^workspace:assistant\.proposal\.batch\.rejectAll/,
    });
    expect(reject).toBeDisabled();
    expect(reject).toHaveAttribute("data-loading");
    expect(
      screen.getByRole("button", {
        name: "workspace:assistant.proposal.batch.approveAll",
      }),
    ).toBeDisabled();
  });
});
