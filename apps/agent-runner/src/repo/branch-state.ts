/**
 * Where a run's branch stood before it started: not pushed yet, pushed with
 * no change against the base (as Start leaves it), or holding earlier work.
 */
export type BranchState = "new" | "empty" | "continued";
