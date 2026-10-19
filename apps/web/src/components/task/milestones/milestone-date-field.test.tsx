import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { MilestoneDateField } from "./milestone-date-field";
vi.mock("@/lib/i18n", () => ({
  i18n: {
    resolvedLanguage: "en-US",
    language: "en-US",
    t: (key: string) => key,
  },
}));
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: { date?: string }) =>
      options?.date ? `${key} ${options.date}` : key,
  }),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Local noon makes Today stable under either a positive or negative TZ.
  vi.setSystemTime(new Date(2030, 0, 10, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const startLabel = "tasks:milestones.startDate";
const endLabel = "tasks:milestones.endDate";
function view(props: Partial<Parameters<typeof MilestoneDateField>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <MilestoneDateField kind="start" value="" onChange={onChange} {...props} />,
  );
  return onChange;
}
async function open(label = startLabel) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  return screen.findByRole("combobox", { name: label });
}

describe("Milestone date field", () => {
  it("uses the shared quick dates and closes after selection without a UTC shift", async () => {
    const onChange = view();
    await open();
    fireEvent.click(
      await screen.findByRole("option", { name: /^tasks:due.today/ }),
    );
    expect(onChange).toHaveBeenCalledWith("2030-01-10");
    await waitFor(() =>
      expect(
        screen.queryByRole("combobox", { name: startLabel }),
      ).not.toBeInTheDocument(),
    );
  });
  it("opens the existing calendar and selects a calendar day", async () => {
    const onChange = view({ kind: "end" });
    await open(endLabel);
    fireEvent.click(
      await screen.findByRole("option", { name: "tasks:datePicker.pickDate" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /January 12th, 2030/ }),
    );
    expect(onChange).toHaveBeenCalledWith("2030-01-12");
  });
  it.each([
    ["start", startLabel, "tasks:popover.startDate.clear"],
    ["end", endLabel, "tasks:milestones.clearEndDate"],
  ] as const)("clears the optional %s day", async (kind, label, clear) => {
    const onChange = view({ kind, value: "2030-01-14" });
    await open(label);
    fireEvent.click(await screen.findByRole("option", { name: clear }));
    expect(onChange).toHaveBeenCalledWith("");
  });
  it("applies both bounds to typed dates and calendar choices", async () => {
    const onChange = view({
      kind: "end",
      value: "2030-01-14",
      min: "2030-01-12",
      max: "2030-01-15",
    });
    const input = await open(endLabel);
    fireEvent.change(input, { target: { value: "2030-01-11" } });
    expect(
      screen.getByText(/^tasks:datePicker.beforeStart /),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(
      await screen.findByRole("option", { name: "tasks:datePicker.pickDate" }),
    );
    expect(
      await screen.findByRole("button", { name: /January 11th, 2030/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /January 16th, 2030/ }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /January 15th, 2030/ }));
    expect(onChange).toHaveBeenCalledWith("2030-01-15");
  });
  it("preserves typed calendar days around DST boundaries", async () => {
    const onChange = view({ kind: "end" });
    const input = await open(endLabel);
    fireEvent.change(input, { target: { value: "2026-03-29" } });
    fireEvent.click(await screen.findByRole("option"));
    expect(onChange).toHaveBeenCalledWith("2026-03-29");
  });
  it("exposes the field label and validation while disabled", () => {
    view({
      disabled: true,
      invalid: true,
      errorId: "date-error",
      value: "2030-01-14",
    });
    const trigger = screen.getByRole("button", { name: startLabel });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("aria-describedby", "date-error");
    expect(trigger).toHaveTextContent("Jan 14, 2030");
    fireEvent.click(trigger);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
