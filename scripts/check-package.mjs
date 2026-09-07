import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const [artifact] = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  }),
);
const files = new Set(artifact.files.map((file) => file.path));
assert.equal(manifest.name, "@clipin/convex-teams");
for (const required of [
  "LICENSE",
  "NOTICE",
  "README.md",
  "CHANGELOG.md",
  "src/test.ts",
]) {
  assert(files.has(required), `Missing ${required}`);
}
function checkExport(value) {
  if (typeof value === "string")
    assert(files.has(value.replace(/^\.\//, "")), `Missing export ${value}`);
  else for (const child of Object.values(value)) checkExport(child);
}
checkExport(manifest.exports);
for (const file of files) {
  assert(
    !/(^|\/)(\.env[^/]*|\.npmrc|node_modules|\.convex)(\/|$)|\.test\.[^/]+$/.test(
      file,
    ),
    `Unexpected package file ${file}`,
  );
}
console.log(
  `Package checked: ${manifest.name}@${manifest.version}, ${files.size} files.`,
);
