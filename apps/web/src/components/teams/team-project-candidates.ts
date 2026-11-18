type ProjectOption = { id: string; name: string; icon?: string | null };

// Projects the team isn't linked to yet, by name.
export function teamProjectCandidates<T extends ProjectOption>(
  projects: readonly T[],
  linkedProjectIds: readonly string[],
): T[] {
  const linked = new Set(linkedProjectIds);
  return projects
    .filter((project) => !linked.has(project.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}
