export function remToPx(rem: number) {
  const rootSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return rem * (Number.isFinite(rootSize) && rootSize > 0 ? rootSize : 16);
}

// Moves a scroll container by `px` at once, keeping the content under the
// viewport in place after columns were added or removed before it.
export function shiftScrollLeft(element: HTMLElement, px: number) {
  element.scrollLeft += px;
}
