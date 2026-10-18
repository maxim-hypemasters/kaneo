import { renderCell, text } from "../render/cell.js";
import { sanitizeText } from "../render/sanitize.js";
import type { Ui } from "../render/ui.js";

export type ReleaseChange = {
  readonly verb: "Created" | "Updated" | "Deleted";
  readonly name: string;
  readonly url?: string;
  readonly details: ReadonlyArray<string>;
};

export function renderReleaseChange(ui: Ui, change: ReleaseChange): string[] {
  const { theme, glyphs } = ui;
  const name = renderCell([text(change.name, theme.strong, change.url)], ui);
  const separator = ` ${theme.muted(glyphs.separator)} `;
  const details = change.details
    .filter((detail) => detail !== "")
    .map(sanitizeText);
  return [
    "",
    `  ${theme.success(glyphs.tick)} ${change.verb} release ${[name, ...details].join(separator)}`,
    "",
  ];
}
