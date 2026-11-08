import { afterEach, describe, expect, it } from "vite-plus/test";
import { visibleBounds } from "./visible-bounds";

function box(style: string, rect?: { top: number; bottom: number }) {
  const element = document.createElement("div");
  element.setAttribute("style", style);
  if (rect)
    element.getBoundingClientRect = () =>
      new DOMRect(0, rect.top, 100, rect.bottom - rect.top);
  return element;
}

function nest(...elements: HTMLElement[]) {
  let parent: HTMLElement = document.body;
  for (const element of elements) {
    parent.append(element);
    parent = element;
  }
  return parent;
}

const viewport = { top: 0, height: 500 };

afterEach(() => {
  document.body.innerHTML = "";
});

describe("visibleBounds", () => {
  it("is the viewport when nothing clips", () => {
    const shell = nest(box(""), box(""));
    expect(visibleBounds(shell, viewport)).toEqual(viewport);
  });

  it("starts below a header that sits above the page's scroller", () => {
    const shell = nest(
      box("overflow-y: auto", { top: 49, bottom: 500 }),
      box(""),
    );
    expect(visibleBounds(shell, viewport)).toEqual({ top: 49, height: 451 });
  });

  it("keeps the tightest of several clipping ancestors and the viewport", () => {
    const shell = nest(
      box("overflow-y: hidden", { top: -100, bottom: 420 }),
      box("overflow-y: scroll", { top: 60, bottom: 900 }),
      box(""),
    );
    expect(visibleBounds(shell, { top: 10, height: 300 })).toEqual({
      top: 60,
      height: 250,
    });
    expect(visibleBounds(shell, viewport)).toEqual({ top: 60, height: 360 });
  });

  it("ignores ancestors outside a fixed element", () => {
    const shell = nest(
      box("overflow-y: hidden", { top: 200, bottom: 300 }),
      box("position: fixed"),
      box(""),
    );
    expect(visibleBounds(shell, viewport)).toEqual(viewport);
  });
});
