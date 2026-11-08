import type { PlannedImportRelation } from "./plan-import-relations";

// Features have no relations, so a source link that ends at a Feature (one
// imported as a Feature, or promoted from a parent) is left out of the import.
export function omitFeatureRelations(
  relations: readonly PlannedImportRelation[],
  featureIds: ReadonlySet<string>,
): { relations: PlannedImportRelation[]; warnings: string[] } {
  const kept = relations.filter(
    (relation) =>
      !featureIds.has(relation.sourceTaskId) &&
      !featureIds.has(relation.targetTaskId),
  );
  const omitted = relations.length - kept.length;
  return {
    relations: kept,
    warnings:
      omitted === 0
        ? []
        : [
            omitted === 1
              ? "1 task link to a feature was not copied: features don't have relations."
              : `${omitted} task links to features were not copied: features don't have relations.`,
          ],
  };
}
