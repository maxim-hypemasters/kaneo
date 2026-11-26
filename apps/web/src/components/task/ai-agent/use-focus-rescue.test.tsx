import { act, cleanup, render } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { useFocusRescue } from "./use-focus-rescue";

function Panel() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);
  useFocusRescue(ref);
  return (
    <div ref={ref} tabIndex={-1} data-testid="panel">
      {shown ? (
        <button type="button" onClick={() => setShown(false)}>
          Dismiss
        </button>
      ) : null}
      <button type="button">Stays</button>
    </div>
  );
}

afterEach(() => cleanup());

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));

describe("useFocusRescue", () => {
  it("moves focus to the container when the focused control is removed", async () => {
    const view = render(<Panel />);
    const dismiss = view.getByText("Dismiss");
    dismiss.focus();
    act(() => dismiss.click());
    await flush();
    expect(document.activeElement).toBe(view.getByTestId("panel"));
  });

  it("leaves focus alone when it already moved elsewhere", async () => {
    const view = render(<Panel />);
    const dismiss = view.getByText("Dismiss");
    dismiss.focus();
    view.getByText("Stays").focus();
    act(() => dismiss.click());
    await flush();
    expect(document.activeElement).toBe(view.getByText("Stays"));
  });
});
