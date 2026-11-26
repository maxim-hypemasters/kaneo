import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { tempDir, testConfig } from "../test-support/fixtures";
import { prepareWorkDir } from "./prepare-work-dir";

describe("prepareWorkDir", () => {
  it("removes leftover runs and push copies and keeps the mirrors", async () => {
    const root = await tempDir();
    const config = testConfig(root, {});
    const work = (...parts: string[]) => path.join(config.workDir, ...parts);
    await mkdir(work("runs", "old", "repo"), { recursive: true });
    await mkdir(work("push", "old.git"), { recursive: true });
    await mkdir(work("mirrors", "acme__app.git"), { recursive: true });
    await writeFile(work("mirrors", "acme__app.git", "HEAD"), "ref");

    await prepareWorkDir(config);

    expect(existsSync(work("runs", "old"))).toBe(false);
    expect(existsSync(work("push", "old.git"))).toBe(false);
    expect(existsSync(work("mirrors", "acme__app.git", "HEAD"))).toBe(true);
    expect((await stat(work("mirrors"))).mode & 0o777).toBe(0o700);
    expect((await stat(work("push"))).mode & 0o777).toBe(0o700);
    expect((await stat(work("runs"))).mode & 0o777).toBe(0o711);
  });
});
