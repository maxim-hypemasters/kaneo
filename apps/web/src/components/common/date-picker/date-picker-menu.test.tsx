import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DatePickerMenu } from "./date-picker-menu";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { date?: string }) =>
      options?.date ? `${key} ${options.date}` : key,
  }),
}));

afterEach(cleanup);

const bounds = {
  before: new Date(2030, 0, 10),
  after: new Date(2030, 0, 20),
};

function renderMenu(props: Partial<Parameters<typeof DatePickerMenu>[0]>) {
  render(
    <DatePickerMenu
      label="Code freeze"
      placeholder="Set date…"
      clearLabel="Clear"
      value={null}
      onChange={vi.fn()}
      bounds={bounds}
      {...props}
    />,
  );
  return screen.getByPlaceholderText("Set date…");
}

describe("DatePickerMenu", () => {
  it("keeps its own wording for a typed day out of range", () => {
    const input = renderMenu({});

    fireEvent.change(input, { target: { value: "2030-01-05" } });

    expect(
      screen.getByText(/^tasks:datePicker\.beforeStart /),
    ).toBeInTheDocument();
  });

  it("words a typed day out of range by side when asked", () => {
    const outOfRangeLabel = vi.fn(
      (side: "before" | "after", date: string) => `${side}: ${date}`,
    );
    const input = renderMenu({ outOfRangeLabel });

    fireEvent.change(input, { target: { value: "2030-01-25" } });

    expect(screen.getByText(/^after: /)).toBeInTheDocument();
    expect(outOfRangeLabel).toHaveBeenLastCalledWith(
      "after",
      expect.any(String),
    );

    fireEvent.change(input, { target: { value: "2030-01-05" } });

    expect(screen.getByText(/^before: /)).toBeInTheDocument();
  });

  it("shows a given limit hint instead of the formatted one", () => {
    renderMenu({
      formatLimit: (date) => `Due ${date}`,
      limitHint: "Between Jan 10 and Jan 20",
    });

    expect(screen.getByText("Between Jan 10 and Jan 20")).toBeInTheDocument();
    expect(screen.queryByText(/^Due /)).toBeNull();
  });

  it("still formats the limit without a given hint", () => {
    renderMenu({ formatLimit: (date) => `Due ${date}` });

    expect(screen.getByText(/^Due /)).toBeInTheDocument();
  });
});
