import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(manifest.name, "@clipin/convex-teams");
assert.equal(
  Object.keys(
    JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
    ).patchedDependencies ?? {},
  ).length,
  0,
  "Release blocked: replace the development dependency patch with a corrected published dependency.",
);
assert.equal(
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  "",
  "Release blocked: commit the release candidate first.",
);
execFileSync("bun", ["run", "pack:check"], { stdio: "inherit" });
