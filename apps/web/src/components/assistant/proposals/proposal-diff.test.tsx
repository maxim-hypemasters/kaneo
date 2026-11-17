import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DIFF_CLAMP_ROWS, ProposalDiff } from "./proposal-diff";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "count" in options ? `${key}[${options.count}]` : key,
  }),
}));

const region = () =>
  screen.getByRole("region", {
    name: "workspace:assistant.proposal.diff.label",
  });

afterEach(cleanup);

describe("ProposalDiff", () => {
  it("marks changed lines with a gutter and words, not only color", () => {
    render(<ProposalDiff before={"Keep\nOld\n"} after={"Keep\nNew\n"} />);

    const rows = [...region().children] as HTMLElement[];
    expect(rows.map((row) => row.textContent)).toEqual([
      "Keep",
      "−workspace:assistant.proposal.diff.removed: Old",
      "+workspace:assistant.proposal.diff.added: New",
    ]);
    const gutter = rows[1]?.querySelector('[aria-hidden="true"]');
    expect(gutter).toHaveTextContent("−");
    expect(rows[1]?.querySelector(".sr-only")).toHaveTextContent(
      "workspace:assistant.proposal.diff.removed:",
    );
  });

  it("folds unchanged stretches into a count", () => {
    const body = Array.from({ length: 12 }, (_, index) => `line ${index}`);
    render(
      <ProposalDiff
        before={[...body, "end"].join("\n")}
        after={[...body, "END"].join("\n")}
      />,
    );
    expect(region()).toHaveTextContent(
      "workspace:assistant.proposal.diff.unchanged[9]",
    );
    expect(region()).not.toHaveTextContent("line 0");
  });

  it("clamps a long diff until Show all", () => {
    const after = Array.from(
      { length: DIFF_CLAMP_ROWS + 5 },
      (_, index) => `new ${index}`,
    ).join("\n");
    render(<ProposalDiff before="" after={after} />);

    expect(region().children).toHaveLength(DIFF_CLAMP_ROWS);
    const toggle = screen.getByRole("button", {
      name: "workspace:assistant.proposal.showAll",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", region().id);

    fireEvent.click(toggle);
    expect(region().children).toHaveLength(DIFF_CLAMP_ROWS + 5);
    expect(
      screen.getByRole("button", {
        name: "workspace:assistant.proposal.showLess",
      }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("says when the text stays the same", () => {
    render(<ProposalDiff before="Same" after="Same" />);
    expect(
      screen.getByText("workspace:assistant.proposal.diff.noChanges"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });
});
