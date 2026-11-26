import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { RailCard } from "./rail-card";

afterEach(cleanup);

describe("RailCard", () => {
  it("names its region after the title and holds its content", () => {
    render(
      <RailCard title="Teams" count={2}>
        <p>Design</p>
      </RailCard>,
    );

    const card = screen.getByRole("region", { name: "Teams" });
    expect(within(card).getByRole("heading", { name: "Teams" })).toBeVisible();
    expect(within(card).getByText("2")).toBeVisible();
    expect(within(card).getByText("Design")).toBeVisible();
  });

  it("hides a zero count and shows the header action", () => {
    render(
      <RailCard
        title="Fields"
        count={0}
        action={<button type="button">Manage</button>}
      />,
    );

    const card = screen.getByRole("region", { name: "Fields" });
    expect(within(card).queryByText("0")).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Manage" })).toBeVisible();
  });
});
