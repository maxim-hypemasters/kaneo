// Plans read and move tasks, bugs and milestones together.
export const PLANNING_READ = {
  task: ["read"],
  bug: ["read"],
  milestone: ["read"],
};

export const PLANNING_WRITE = {
  project: ["update"],
  task: ["read", "update"],
  bug: ["read", "update"],
  milestone: ["read", "update"],
};
