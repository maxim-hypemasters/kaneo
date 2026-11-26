import { readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { runCommand } from "../process/run-command";
import { tempDir } from "../test-support/fixtures";
import { copyUntrustedFile } from "./copy-untrusted-file";

describe("copyUntrustedFile", () => {
  it("copies a regular file to a new file", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "work.bundle"), "bundle");
    await copyUntrustedFile(
      path.join(root, "work.bundle"),
      path.join(root, "copy"),
      null,
    );
    expect(await readFile(path.join(root, "copy"), "utf8")).toBe("bundle");
    await expect(
      copyUntrustedFile(
        path.join(root, "work.bundle"),
        path.join(root, "copy"),
        null,
      ),
    ).rejects.toThrow();
  });

  it("refuses a symlink and a file another user owns", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "secret"), "token");
    await symlink(path.join(root, "secret"), path.join(root, "link"));
    await expect(
      copyUntrustedFile(path.join(root, "link"), path.join(root, "a"), null),
    ).rejects.toThrow();
    const stranger = { uid: (process.getuid?.() ?? 0) + 4242, gid: 4242 };
    await expect(
      copyUntrustedFile(
        path.join(root, "secret"),
        path.join(root, "b"),
        stranger,
      ),
    ).rejects.toThrow("is not a file Hermes wrote");
  });

  it("refuses a FIFO without waiting for a writer", async () => {
    const root = await tempDir();
    const fifo = path.join(root, "work.bundle");
    await runCommand("mkfifo", [fifo], { check: true });
    await expect(
      copyUntrustedFile(fifo, path.join(root, "copy"), null),
    ).rejects.toThrow("is not a file Hermes wrote");
  });
});
