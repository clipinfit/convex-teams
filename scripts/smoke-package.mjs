import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "convex-teams-packed-"));
const candidate = process.argv[2] ? resolve(process.argv[2]) : null;
const environment = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
for (const key of [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
])
  delete environment[key];
function run(command, args, cwd = directory) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
try {
  const [artifact] = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", directory], root),
  );
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify(
      {
        name: "teams-packed-smoke",
        private: true,
        type: "module",
        devDependencies: {
          typescript: "7.0.2",
          "@types/node": "22.20.1",
          vitest: "4.1.10",
          vite: "8.2.1",
          "convex-test": "0.0.55",
          "@edge-runtime/vm": "5.0.0",
        },
        dependencies: {
          "convex-teams": `file:${join(directory, artifact.filename)}`,
          convex: "1.43.0",
          ...(candidate ? { "convex-invite": `file:${candidate}` } : {}),
        },
      },
      null,
      2,
    ),
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
  mkdirSync(join(directory, "convex"));
  writeFileSync(
    join(directory, "convex.json"),
    JSON.stringify({ functions: "convex/" }),
  );
  writeFileSync(
    join(directory, "convex/convex.config.ts"),
    `import { defineApp } from "convex/server";\nimport teams from "convex-teams/convex.config.js";\nconst app = defineApp(); app.use(teams); export default app;\n`,
  );
  writeFileSync(
    join(directory, "convex/schema.ts"),
    `import { defineSchema } from "convex/server"; export default defineSchema({});\n`,
  );
  writeFileSync(
    join(directory, "convex/proof.ts"),
    `
import { v } from "convex/values";
import { TeamsClient } from "convex-teams";
import { components } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";
const teams = new TeamsClient(components.teams);
export const run = internalMutation({
  args: {},
  returns: v.object({ invitationPages: v.number(), memberCount: v.number(), rolledBack: v.boolean() }),
  handler: async ctx => {
    const owner = crypto.randomUUID();
    const team = await teams.createTeam(ctx, owner, "Packed smoke");
    const first = await teams.createInvite(ctx, { userId: owner, teamSlug: team.teamSlug, email: "one@example.com", role: "member" });
    await teams.createInvite(ctx, { userId: owner, teamSlug: team.teamSlug, email: "two@example.com", role: "member" });
    const page1 = await teams.listPendingInvites(ctx, owner, team.teamSlug, { numItems: 1, cursor: null });
    const page2 = await teams.listPendingInvites(ctx, owner, team.teamSlug, { numItems: 1, cursor: page1.continueCursor });
    if (page1.page.length !== 1 || page2.page.length !== 1 || page1.page[0].inviteId === page2.page[0].inviteId) throw new Error("Invitation pagination failed.");
    let rolledBack = false;
    try { await teams.acceptInvite(ctx, { userId: "one", email: "one@example.com", token: first.token, seatLimit: 1 }); }
    catch { rolledBack = true; }
    await teams.acceptInvite(ctx, { userId: "one", email: "one@example.com", token: first.token, seatLimit: 2 });
    const members = await teams.listMembers(ctx, owner, team.teamSlug, { numItems: 10, cursor: null });
    if (!rolledBack || members?.page.length !== 2) throw new Error("Atomic membership grant failed.");
    return { invitationPages: 2, memberCount: members.page.length, rolledBack };
  },
});
`,
  );
  const cli = join(directory, "node_modules/convex/bin/main.js");
  run(process.execPath, [cli, "dev", "--once", "--typecheck", "disable"]);
  run(join(directory, "node_modules/.bin/tsc"), [
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ESNext",
    "--module",
    "ESNext",
    "--moduleResolution",
    "bundler",
    "convex/proof.ts",
    "convex/convex.config.ts",
  ]);
  writeFileSync(
    join(directory, "vitest.config.ts"),
    `import { defineConfig } from "vitest/config"; export default defineConfig({ test: { environment: "edge-runtime" } });`,
  );
  writeFileSync(
    join(directory, "smoke.test.ts"),
    `
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { register } from "convex-teams/test";
import schema from "./convex/schema.js";
import { internal } from "./convex/_generated/api.js";
test("packed component registration and grant rollback", async () => {
  const t = convexTest(schema, import.meta.glob("./convex/**/*.ts"));
  register(t);
  expect(await t.mutation(internal.proof.run, {})).toEqual({ invitationPages: 2, memberCount: 2, rolledBack: true });
});
`,
  );
  run(join(directory, "node_modules/.bin/vitest"), ["run"]);
  const result = JSON.parse(run(process.execPath, [cli, "run", "proof:run"]));
  assert.deepEqual(result, {
    invitationPages: 2,
    memberCount: 2,
    rolledBack: true,
  });
  const dependency = JSON.parse(
    readFileSync(
      join(directory, "node_modules/convex-invite/package.json"),
      "utf8",
    ),
  );
  console.log(
    JSON.stringify(
      {
        directory,
        candidate: candidate ?? "registry",
        inviteVersion: dependency.version,
        ...result,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`Packed smoke failed. Inspect ${directory}.`);
  if (error && typeof error === "object" && "stderr" in error)
    console.error(String(error.stderr));
  throw error;
}
