import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const root = process.cwd(),
  temp = await mkdtemp(join(tmpdir(), "toolgraft-portable-"));
try {
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", root, temp]);
  execFileSync(
    "pnpm",
    ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"],
    { cwd: temp, stdio: "pipe" },
  );
  const run = () =>
    spawnSync(
      process.execPath,
      [join(temp, "packages/cli/src/index.ts"), "registry", "verify"],
      { cwd: temp, encoding: "utf8" },
    );
  let result = run();
  if (result.status !== 0)
    throw new Error(
      "Different-checkout reproduction failed: " +
        result.stderr +
        result.stdout,
    );
  console.log(
    "Registry artifacts reproduce byte-for-byte from a different absolute checkout path.",
  );
  const p = join(
    temp,
    "registry/packages/community.playground/0.1.0/adapter.tgz",
  );
  const bytes = await readFile(p);
  bytes[20] ^= 1;
  await writeFile(p, bytes);
  result = run();
  if (
    result.status === 0 ||
    !result.stderr.includes("Immutable artifact changed")
  )
    throw new Error("Mutation was not refused: " + result.stderr);
  console.log(
    "Existing artifact byte mutation was refused; new version required.",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
