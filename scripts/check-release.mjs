import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(manifest.name, "convex-teams");
assert.equal(
  Object.keys(manifest.patchedDependencies ?? {}).length,
  0,
  "Release blocked: replace the development dependency patch with a corrected published dependency.",
);
assert.equal(
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  "",
  "Release blocked: commit the release candidate first.",
);
execFileSync("bun", ["run", "pack:check"], { stdio: "inherit" });
