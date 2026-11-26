import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { runCommand } from "../process/run-command";
import {
  killUserProcesses,
  removeUserTempFiles,
  userHasProcesses,
} from "./end-user-processes";

// These switch users, so they need root on Linux, as in the runner image;
// elsewhere they're skipped.
const asRoot = process.platform === "linux" && process.getuid?.() === 0;
// A user nothing else runs as.
const user = { uid: 64123, gid: 64123 };
// Deleting a tree deeper than PATH_MAX takes GNU rm, as in the runner image.
const gnuRm =
  asRoot && spawnSync("rm", ["--version"]).stdout?.includes("GNU coreutils");

async function until(check: () => Promise<boolean>) {
  for (let tries = 0; tries < 100 && !(await check()); tries++)
    await new Promise((resolve) => setTimeout(resolve, 20));
}

describe.skipIf(!asRoot)("ending a slot user's run, as root", () => {
  it("kills every process of the user, daemons included, and no other", async () => {
    await runCommand("sh", ["-c", "setsid sleep 300 >/dev/null 2>&1 &"], {
      user,
      check: true,
    });
    const other = spawn("sleep", ["300"], { stdio: "ignore" });
    try {
      await until(() => userHasProcesses(user.uid));
      expect(await userHasProcesses(user.uid)).toBe(true);

      expect(await killUserProcesses(user)).toBe(true);

      expect(await userHasProcesses(user.uid)).toBe(false);
      expect(other.exitCode).toBeNull();
      expect(other.signalCode).toBeNull();
    } finally {
      other.kill("SIGKILL");
    }
  });

  it.skipIf(!gnuRm)(
    "deletes a tree the user nested deeper than a path can name",
    async () => {
      const top = `/tmp/kaneo-runner-deep-${process.pid}`;
      const half = `/tmp/kaneo-runner-half-${process.pid}`;
      const chain = `/${"a".repeat(250)}`.repeat(15);
      // Two halves of about 3.8 KB each, one moved into the other: past
      // PATH_MAX, with a read-only directory at the bottom.
      await runCommand(
        "sh",
        [
          "-c",
          `mkdir -p ${top}${chain} ${half}${chain}/ro && touch ${half}${chain}/ro/entry && chmod 555 ${half}${chain}/ro && mv ${half} ${top}${chain}/`,
        ],
        { user, check: true },
      );

      await removeUserTempFiles(user);

      expect(existsSync(top)).toBe(false);
    },
  );

  it("deletes the user's temporary files, even in a directory it made unreadable", async () => {
    const base = `/tmp/kaneo-runner-test-${process.pid}`;
    await runCommand(
      "sh",
      [
        "-c",
        `touch ${base}-file && mkdir ${base}-dir && touch ${base}-dir/cache && chmod 100 ${base}-dir`,
      ],
      { user, check: true },
    );

    await removeUserTempFiles(user);

    expect(existsSync(`${base}-file`)).toBe(false);
    expect(existsSync(`${base}-dir`)).toBe(false);
  });
});
