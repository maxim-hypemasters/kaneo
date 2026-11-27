/**
 * Copies text to the clipboard, degrading gracefully outside secure contexts.
 *
 * navigator.clipboard is only defined over HTTPS or on localhost. A self-hosted
 * instance reached over plain HTTP (a normal deployment for this project) has
 * no such API, so the deprecated execCommand path is the only one that works
 * there and is kept deliberately.
 *
 * Text that is still loading is passed as a promise, and the call must
 * happen in the click handler, before any await: Safari and Firefox copy
 * only during the click, so the clipboard gets a pending ClipboardItem.
 *
 * Returns whether the text made it to the clipboard by any route.
 */
export async function copyToClipboard(
  source: string | Promise<string>,
): Promise<boolean> {
  if (typeof source !== "string") return copyPendingText(source);

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(source);
      return true;
    } catch {
      // Permission denied or a transient failure: fall through to the legacy path.
    }
  }

  const scratch = document.createElement("textarea");
  scratch.value = source;
  scratch.setAttribute("readonly", "");
  // Kept off-screen rather than hidden: execCommand ignores nodes that are not
  // rendered, so display:none or visibility:hidden would break the copy.
  scratch.style.position = "fixed";
  scratch.style.top = "-9999px";
  scratch.style.opacity = "0";
  document.body.appendChild(scratch);

  try {
    scratch.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    scratch.remove();
  }
}

async function copyPendingText(source: Promise<string>): Promise<boolean> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    // Older Chromium accepts only a Blob promise here, not a string one.
    const blob = source.then(
      (text) => new Blob([text], { type: "text/plain" }),
    );
    // Handled here too, in case the clipboard never reads it.
    blob.catch(() => {});
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": blob }),
      ]);
      return true;
    } catch {
      // Unsupported, denied, or the text failed to load: try the text itself.
    }
  }

  try {
    return await copyToClipboard(await source);
  } catch {
    return false;
  }
}
