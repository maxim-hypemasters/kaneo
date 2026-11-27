import { START_MARKER } from "./start-marker";

/**
 * The body a Ship gives the draft Start opened: the Ship's body, after
 * whatever people wrote on the draft since. Start's own sentence and marker
 * are dropped.
 */
export function readyPullRequestBody(input: {
  current: string;
  startText: string;
  shipBody: string;
}) {
  const kept = input.current
    .split(START_MARKER)
    .join("")
    .replace(input.startText, "")
    .trim();
  return kept ? `${kept}\n\n---\n\n${input.shipBody}` : input.shipBody;
}
