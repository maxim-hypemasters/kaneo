import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { EstimateInput } from "./estimate-input";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);

function Editor({ onValue }: { onValue: (value: number | null) => void }) {
  const [value, setValue] = useState<number | null>(3600);
  return (
    <EstimateInput
      value={value}
      onChange={(next) => {
        onValue(next);
        setValue(next);
      }}
    />
  );
}

describe("estimate controls", () => {
  it("converts fractional hours and distinguishes clearing", () => {
    const changed = vi.fn();
    render(<Editor onValue={changed} />);
    const input = screen.getByRole("textbox", {
      name: "tasks:estimate.label",
    });
    fireEvent.change(input, { target: { value: "1.5h" } });
    expect(changed).toHaveBeenLastCalledWith(5400);
    fireEvent.change(input, { target: { value: "" } });
    expect(changed).toHaveBeenLastCalledWith(null);
  });
  it("retains invalid text and prevents sub-minute writes", () => {
    const changed = vi.fn();
    render(<Editor onValue={changed} />);
    const input = screen.getByRole("textbox", {
      name: "tasks:estimate.label",
    });
    fireEvent.change(input, { target: { value: "0.001h" } });
    expect(changed).not.toHaveBeenCalled();
    expect(input).toHaveValue("0.001h");
    expect(input).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:estimate.invalid",
    );
  });
  it("keeps typed fractional shorthand through controlled updates and normalizes on blur", () => {
    const changed = vi.fn();
    render(<Editor onValue={changed} />);
    const input = screen.getByRole("textbox", { name: "tasks:estimate.label" });
    fireEvent.change(input, { target: { value: "0.5d" } });
    expect(changed).toHaveBeenLastCalledWith(14_400);
    expect(input).toHaveValue("0.5d");
    fireEvent.blur(input);
    expect(input).toHaveValue("4h");
  });

  it("accepts combined work units without introducing a unit menu", () => {
    const changed = vi.fn();
    render(<Editor onValue={changed} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "1d4h" },
    });
    expect(changed).toHaveBeenLastCalledWith(43_200);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("retains invalid input when the parent retries a failed save", () => {
    const props = { value: 3600, onChange: vi.fn(), onValidityChange: vi.fn() };
    const { rerender } = render(<EstimateInput {...props} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3x" } });
    rerender(<EstimateInput {...props} />);
    expect(screen.getByRole("textbox")).toHaveValue("3x");
    expect(screen.getByRole("textbox")).toBeInvalid();
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("reflects an external estimate change and clears stale validation feedback", () => {
    const changed = vi.fn();
    const { rerender } = render(
      <EstimateInput value={3600} onChange={changed} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3x" } });
    rerender(<EstimateInput value={144_000} onChange={changed} />);
    expect(screen.getByRole("textbox")).toHaveValue("1w");
    expect(screen.getByRole("textbox")).toBeValid();
  });

  it("disables editing while a save is pending", () => {
    render(<EstimateInput value={3600} onChange={vi.fn()} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
