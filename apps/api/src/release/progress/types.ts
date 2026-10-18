export type ProgressCounts = {
  scope: number;
  started: number;
  completed: number;
};

export type ProgressPoint = ProgressCounts & { date: string };

export type StatusChange = {
  date: string;
  status: string;
  delta: number;
};

export type WorkflowChange = {
  id: number;
  date: string;
  columnId: string;
  slug: string;
  position: number;
  isFinal: boolean;
  present: boolean;
};
