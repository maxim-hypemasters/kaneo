import type { ReadReceipt } from "../message-types";
import type { TurnTranscriptRow } from "../turn/turn-messages";

export type RewriteReceiptInput = {
  kind: ReadReceipt["kind"];
  id: string;
  /** The revision, or the description's hash, the text has now. */
  currentVersion: string;
  transcript: readonly Pick<
    TurnTranscriptRow,
    "id" | "role" | "readReceipts"
  >[];
  /** Tool rows whose full result the model saw in this step's messages. */
  replayedToolRowIds: ReadonlySet<string>;
};

/**
 * Whether the model saw the whole current text before proposing to replace
 * it: some tool row it was shown in full holds a receipt for this exact
 * version. A read that was stubbed out of the window doesn't count.
 */
export function checkRewriteReceipt(input: RewriteReceiptInput): boolean {
  return input.transcript.some(
    (row) =>
      row.role === "tool" &&
      input.replayedToolRowIds.has(row.id) &&
      (row.readReceipts ?? []).some(
        (receipt) =>
          receipt.kind === input.kind &&
          receipt.id === input.id &&
          receipt.version === input.currentVersion,
      ),
  );
}
