type SlashMenuPlacementInput = {
  // Caret rectangle, in viewport coordinates.
  anchor: { top: number; bottom: number; left: number };
  // The positioned container the menu is absolutely placed in.
  origin: { top: number; left: number; width: number };
  // The visible part of the viewport (visualViewport when available).
  viewport: { top: number; height: number };
  // The menu's natural size, before any height cap.
  menu: { width: number; height: number };
  gap?: number;
  margin?: number;
  preferred?: number;
};

export type SlashMenuPlacement = {
  top: number;
  left: number;
  maxHeight: number;
};

export function placeSlashMenu({
  anchor,
  origin,
  viewport,
  menu,
  gap = 4,
  margin = 8,
  preferred = 288,
}: SlashMenuPlacementInput): SlashMenuPlacement {
  const below = viewport.top + viewport.height - margin - anchor.bottom - gap;
  const above = anchor.top - gap - viewport.top - margin;
  const wanted = Math.min(menu.height, preferred);
  const flip = below < wanted && above > below;
  const maxHeight = Math.max(0, Math.min(preferred, flip ? above : below));
  const height = Math.min(menu.height, maxHeight);
  const top = flip ? anchor.top - gap - height : anchor.bottom + gap;
  const left = Math.min(
    Math.max(0, anchor.left - origin.left),
    Math.max(0, origin.width - menu.width),
  );
  return { top: top - origin.top, left, maxHeight };
}
