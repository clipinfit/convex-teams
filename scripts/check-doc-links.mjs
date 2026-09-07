import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const content = resolve(root, "apps/web/content/docs");
const pages = readdirSync(content).filter((name) => name.endsWith(".mdx"));
const routes = new Set(
  pages.map((name) =>
    name === "index.mdx" ? "/docs" : `/docs/${name.slice(0, -4)}`,
  ),
);
let count = 0;
for (const file of [
  "README.md",
  "RELEASING.md",
  "packages/convex-teams/README.md",
  ...pages.map((name) => `apps/web/content/docs/${name}`),
]) {
  const source = readFileSync(resolve(root, file), "utf8");
  for (const [, url] of source.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const path = url.split("#")[0];
    if (!path) continue;
    if (path.startsWith("/docs")) {
      assert(routes.has(path), `${file}: missing docs route ${path}`);
    } else if (path.startsWith("https://github.com/clipinfit/convex-teams/")) {
      const match = path.match(/\/(?:blob|tree)\/main\/(.+)$/);
      if (match)
        assert(
          existsSync(resolve(root, match[1])),
          `${file}: missing source ${match[1]}`,
        );
    } else if (!/^[a-z]+:/.test(path)) {
      assert(
        existsSync(resolve(dirname(resolve(root, file)), path)),
        `${file}: missing file ${path}`,
      );
    }
    count++;
  }
}
console.log(
  `Checked ${count} documentation links across ${pages.length} website pages and repository guides.`,
);
