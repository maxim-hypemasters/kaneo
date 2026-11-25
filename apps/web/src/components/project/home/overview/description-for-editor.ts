// The editor keeps the text it last sent while the form holds that same text,
// which a save stores trimmed; feeding the trimmed copy back would reset the
// editor under the caret. Any other form value came from elsewhere, such as
// another person's save, and replaces what the editor shows.
export function descriptionForEditor(draft: string, formValue: string) {
  return draft.trim() === formValue.trim() ? draft : formValue;
}
