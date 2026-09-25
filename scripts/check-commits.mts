import { execFileSync } from "node:child_process";

// Check the requested development history, not tool-owned checkpoint refs or
// archival source tags. Git-generated merge commits are excluded.
const head = process.env.COMMIT_HEAD || "HEAD";
const base = process.env.COMMIT_BASE;
const range = base && !/^0+$/.test(base) ? `${base}..${head}` : head;
const commits = execFileSync(
  "git",
  ["log", "--no-merges", "--format=%h%x00%s", range, "--"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const subjectPattern =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S.*$/;
const failures = commits.filter((commit) => {
  const subject = commit.split("\0")[1] ?? "";
  return !subjectPattern.test(subject) || subject.length > 100;
});
if (failures.length) {
  console.error(
    "Use type(scope): description, with a subject under 101 characters.",
  );
  for (const commit of failures) console.error(commit.replace("\0", " "));
  process.exitCode = 1;
} else {
  console.log(
    `Conventional Commits: ${commits.length} commit subjects checked.`,
  );
}
