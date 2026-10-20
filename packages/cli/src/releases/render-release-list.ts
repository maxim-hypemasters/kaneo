import { type Cell, renderCell, text } from "../render/cell.js";
import { renderTable } from "../render/table.js";
import type { Style } from "../render/theme.js";
import type { Ui } from "../render/ui.js";
import { formatReleaseDay } from "./release-dates.js";
import type { ReleaseJson } from "./release-json.js";
import { PHASE_LABELS, type ReleasePhase } from "./release-phase.js";

export type ReleaseListView = {
  readonly projectName: string;
  readonly projectSlug: string;
  readonly projectUrl: string;
  readonly today: string;
  readonly releases: ReadonlyArray<ReleaseJson>;
};

export function phaseStyle(ui: Ui, phase: ReleasePhase): Style {
  const { theme } = ui;
  if (phase === "in-progress") return theme.progress;
  if (phase === "code-freeze") return theme.warning;
  return theme.muted;
}

export function renderReleaseList(ui: Ui, view: ReleaseListView): string[] {
  const { theme, glyphs } = ui;
  const header = `  ${renderCell([text(view.projectName, theme.strong, view.projectUrl)], ui)} ${theme.muted(`${glyphs.separator} ${view.projectSlug.toUpperCase()}`)}`;
  if (view.releases.length === 0) {
    return [
      "",
      header,
      "",
      `  ${theme.muted("No releases yet. Create one with kaneo release create <name>.")}`,
      "",
    ];
  }
  const day = (value: string): Cell => [
    text(formatReleaseDay(value, view.today)),
  ];
  const rows = renderTable(
    ui,
    view.releases,
    [
      {
        header: "Release",
        flex: true,
        minWidth: 8,
        cell: (release): Cell => [
          text(release.name, theme.strong, release.url),
        ],
      },
      {
        header: "Phase",
        cell: (release): Cell => [
          text(PHASE_LABELS[release.phase], phaseStyle(ui, release.phase)),
        ],
      },
      {
        header: "Start",
        optional: true,
        cell: (release) => day(release.startDate),
      },
      {
        header: "Freeze",
        optional: true,
        cell: (release) => day(release.codeFreezeDate),
      },
      { header: "Submission", cell: (release) => day(release.submissionDate) },
      {
        header: "Tasks",
        align: "right",
        optional: true,
        cell: (release): Cell =>
          release.progress
            ? [
                text(
                  `${release.progress.tasks.completed}/${release.progress.tasks.total}`,
                ),
              ]
            : [],
      },
      ...(view.releases.some(
        (release) => release.progress?.milestones !== undefined,
      )
        ? [
            {
              header: "Milestones",
              align: "right" as const,
              optional: true,
              cell: (release: ReleaseJson): Cell =>
                release.progress?.milestones
                  ? [
                      text(
                        `${release.progress.milestones.completed}/${release.progress.milestones.total}`,
                      ),
                    ]
                  : [],
            },
          ]
        : []),
      {
        header: "Unfinished",
        align: "right",
        optional: true,
        cell: (release): Cell =>
          release.progress
            ? [
                text(
                  String(release.progress.unfinished),
                  release.progress.unfinished === 0 ? theme.muted : undefined,
                ),
              ]
            : [],
      },
    ],
    { width: ui.caps.columns, indent: 4, header: true },
  );
  return ["", header, "", ...rows, ""];
}
