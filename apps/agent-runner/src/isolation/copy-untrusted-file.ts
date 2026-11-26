import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import type { HermesUser } from "./hermes-user";

const CHUNK = 1 << 20;

/**
 * Copies a file Hermes wrote to a new file only the runner can reach. A
 * symlink, a FIFO or other non-file, or a file Hermes's user doesn't own, is
 * refused, so the runner never reads anything else through that path.
 */
export async function copyUntrustedFile(
  from: string,
  to: string,
  owner: HermesUser | null,
) {
  // O_NONBLOCK: opening a FIFO swapped in for the file would otherwise wait
  // for a writer forever, and no abort reaches a blocked open().
  const source = await open(
    from,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await source.stat();
    if (!stat.isFile() || (owner && stat.uid !== owner.uid))
      throw new Error(`${path.basename(from)} is not a file Hermes wrote`);
    const target = await open(to, "wx", 0o600);
    try {
      const buffer = Buffer.alloc(CHUNK);
      for (;;) {
        const { bytesRead } = await source.read(buffer, 0, CHUNK, null);
        if (!bytesRead) break;
        let written = 0;
        while (written < bytesRead)
          written += (await target.write(buffer, written, bytesRead - written))
            .bytesWritten;
      }
    } finally {
      await target.close();
    }
  } finally {
    await source.close();
  }
}
