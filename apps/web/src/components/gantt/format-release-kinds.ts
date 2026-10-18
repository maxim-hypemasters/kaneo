// Lists a release's date kinds that fall on one day the way the viewer's
// language joins words ("Code freeze and Submission", "コードフリーズ、提出"),
// which a fixed ", " can't do.
export function formatReleaseKinds(
  names: readonly string[],
  locale: string | undefined,
) {
  try {
    return new Intl.ListFormat(locale, {
      style: "long",
      type: "conjunction",
    }).format(names);
  } catch {
    return names.join(", ");
  }
}
