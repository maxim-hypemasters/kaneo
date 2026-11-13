import type { GanttStatusPhase } from "./gantt-status-phase";

type BarStyle = {
  // The bar's outline, or each block's when planned work is split.
  border: string;
  fill: string;
  // While lifted out of its lane.
  ring: string;
  handle: string;
  // On the whole bar.
  bar?: string;
};

// Tasks are blue and bugs red. The fill fades as work moves on: to do is a
// strong fill, in progress a light one, and done a half-transparent dashed
// outline (the bar adds a check, so the status never rests on colour alone).
export const GANTT_BAR_STYLES: Record<
  "task" | "bug",
  Record<GanttStatusPhase, BarStyle>
> = {
  task: {
    todo: {
      border: "border-info/60 hover:border-info/80",
      fill: "bg-info/40 group-hover:bg-info/48",
      ring: "ring-info/40",
      handle: "hover:bg-info/50 focus-visible:bg-info/50",
    },
    active: {
      border: "border-info/40 hover:border-info/60",
      fill: "bg-info/18 group-hover:bg-info/26",
      ring: "ring-info/40",
      handle: "hover:bg-info/35 focus-visible:bg-info/35",
    },
    done: {
      border: "border-dashed border-info/50 hover:border-info/70",
      fill: "bg-info/5 group-hover:bg-info/10",
      ring: "ring-info/40",
      handle: "hover:bg-info/30 focus-visible:bg-info/30",
      bar: "opacity-50",
    },
  },
  bug: {
    todo: {
      border: "border-destructive/60 hover:border-destructive/80",
      fill: "bg-destructive/40 group-hover:bg-destructive/48",
      ring: "ring-destructive/40",
      handle: "hover:bg-destructive/50 focus-visible:bg-destructive/50",
    },
    active: {
      border: "border-destructive/40 hover:border-destructive/60",
      fill: "bg-destructive/18 group-hover:bg-destructive/26",
      ring: "ring-destructive/40",
      handle: "hover:bg-destructive/35 focus-visible:bg-destructive/35",
    },
    done: {
      border: "border-dashed border-destructive/50 hover:border-destructive/70",
      fill: "bg-destructive/5 group-hover:bg-destructive/10",
      ring: "ring-destructive/40",
      handle: "hover:bg-destructive/30 focus-visible:bg-destructive/30",
      bar: "opacity-50",
    },
  },
};
