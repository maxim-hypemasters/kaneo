/**
 * Ends the body of the draft pull request Start opens. Ship marks only a
 * draft that carries it ready for review, never one a person opened.
 */
export const START_MARKER = "<!-- kaneo:start -->";

export function hasStartMarker(body: string | null | undefined) {
  return body?.includes(START_MARKER) ?? false;
}
