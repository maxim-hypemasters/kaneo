type Area = { top: number; height: number };

// The part of `viewport` that the element's clipping ancestors leave visible,
// in viewport coordinates. A menu placed inside a scroller is cut off at the
// scroller's edges, such as just below a page header, not at the screen's.
export function visibleBounds(element: Element, viewport: Area): Area {
  let top = viewport.top;
  let bottom = viewport.top + viewport.height;
  const { body, documentElement } = element.ownerDocument;
  for (
    let node: Element | null = element;
    node && node !== body && node !== documentElement;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    if (style.overflowY !== "visible") {
      const rect = node.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    // Ancestors of a fixed element do not clip it.
    if (style.position === "fixed") break;
  }
  return { top, height: Math.max(0, bottom - top) };
}
