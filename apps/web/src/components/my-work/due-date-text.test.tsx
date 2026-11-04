import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { DueDateText } from "./due-date-text";

vi.mock("react-i18next", async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("updates relative due-date text at midnight with unchanged props", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2030, 0, 1, 23, 59, 59));
  render(<DueDateText dueDate={new Date(2030, 0, 2, 12).toISOString()} />);
  expect(screen.getByText("workspace:myWork.due.tomorrow")).toBeVisible();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("workspace:myWork.due.today")).toBeVisible();
});

it("refreshes an applied finish within a minute without waiting for midnight", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T14:59:30Z"));
  render(<DueDateText applied dueDate="2030-01-01T15:00:00Z" />);
  const label = screen.getByText("workspace:myWork.due.today");
  expect(label).not.toHaveClass("text-destructive-foreground");
  act(() => vi.advanceTimersByTime(60_000));
  expect(label).toHaveClass("text-destructive-foreground");
});
