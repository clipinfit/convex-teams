import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const consumer = process.argv[2] ?? "pedalclass";
if (!["pedalclass", "feedtwin"].includes(consumer))
  throw new Error("Choose pedalclass or feedtwin.");
const source = resolve(process.argv[3] ?? join(root, `../${consumer}`));
const registryVersion = process.env.TEAMS_RELEASE_VERSION;
if (
  registryVersion &&
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(registryVersion)
)
  throw new Error("Expected an exact registry version.");
const directory = mkdtempSync(join(tmpdir(), `teams-${consumer}-`));
const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
for (const key of Object.keys(env))
  if (/CONVEX|TOKEN|SECRET|API_KEY/.test(key)) delete env[key];
env.CONVEX_AGENT_MODE = "anonymous";
function run(command, args, cwd = directory) {
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
try {
  const files = run(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    source,
  )
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    if (
      !(
        file.startsWith("packages/") ||
        ["package.json", "bun.lock", "tsconfig.json"].includes(file)
      )
    )
      continue;
    if (/(^|\/)(\.env[^/]*|\.npmrc|\.convex)(\/|$)/.test(file)) continue;
    const from = join(source, file),
      to = join(directory, file);
    if (!existsSync(from) || !lstatSync(from).isFile()) continue;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  const manifest = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  );
  manifest.workspaces = ["packages/*"];
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify(manifest, null, 2),
  );
  const [archive] = registryVersion
    ? [{ version: registryVersion, filename: "" }]
    : JSON.parse(
        run(
          "npm",
          ["pack", "--json", "--pack-destination", directory],
          join(root, "packages/convex-teams"),
        ),
      );
  const backend = join(directory, "packages/backend");
  const backendManifest = JSON.parse(
    readFileSync(join(backend, "package.json"), "utf8"),
  );
  if (consumer === "feedtwin") {
    backendManifest.dependencies.convex = "1.45.0";
    backendManifest.devDependencies = {
      ...backendManifest.devDependencies,
      vitest: "4.1.11",
      vite: "8.2.2",
      "convex-test": "0.0.56",
      "@edge-runtime/vm": "5.0.0",
    };
    backendManifest.scripts.test = "vitest run";
    writeFileSync(
      join(backend, "vitest.config.mts"),
      'import { defineConfig } from "vitest/config"; export default defineConfig({test:{environment:"edge-runtime",include:["convex/**/*.test.ts"]}});',
    );
  }
  backendManifest.dependencies["convex-teams"] =
    registryVersion ?? `file:${join(directory, archive.filename)}`;
  writeFileSync(
    join(backend, "package.json"),
    JSON.stringify(backendManifest, null, 2),
  );
  run("bun", ["install", "--ignore-scripts"]);
  copyFileSync(
    join(root, `scripts/consumer-fixtures/${consumer}.test.ts.txt`),
    join(backend, "convex/teamsRehearsal.test.ts"),
  );
  const config = join(backend, "convex/convex.config.ts");
  writeFileSync(
    config,
    'import teams from "convex-teams/convex.config.js";\n' +
      readFileSync(config, "utf8").replace(
        "export default app;",
        "app.use(teams);\nexport default app;",
      ),
  );
  console.log(run("bun", ["run", "test"], backend));
  if (consumer === "feedtwin") {
    copyFileSync(
      join(root, "scripts/consumer-fixtures/feedtwin-native.ts.txt"),
      join(backend, "convex/teamsRehearsal.ts"),
    );
    // Local synthetic identities only. Never copy the production issuer or keys.
    writeFileSync(
      join(backend, "convex/auth.config.ts"),
      'export default { providers: [{ domain: "https://rehearsal.invalid", applicationID: "convex" }] };',
    );
    console.log(
      run(
        "bunx",
        ["convex", "dev", "--once", "--typecheck", "disable"],
        backend,
      ),
    );
    const fixture = JSON.parse(
      run("bunx", ["convex", "run", "teamsRehearsal:setup"], backend),
    );
    const result = JSON.parse(
      run(
        "bunx",
        [
          "convex",
          "run",
          "teamsRehearsal:compare",
          JSON.stringify(fixture),
          "--identity",
          JSON.stringify({ subject: "rehearsal-owner" }),
        ],
        backend,
      ),
    );
    if (result !== true) throw new Error("Native Feedtwin comparison failed.");
    let denied = false;
    try {
      run(
        "bunx",
        [
          "convex",
          "run",
          "teamsRehearsal:compare",
          JSON.stringify(fixture),
          "--identity",
          JSON.stringify({ subject: "outsider" }),
        ],
        backend,
      );
    } catch (error) {
      denied = String(error.stderr).includes("Not authorized");
    }
    if (!denied) throw new Error("Native Feedtwin outsider check failed.");
    const ownerIdentity = { subject: "rehearsal-owner" };
    const recipientIdentity = {
      subject: "rehearsal-member",
      email: "rehearsal@example.com",
      emailVerified: true,
    };
    function invoke(name, args, identity) {
      return JSON.parse(
        run(
          "bunx",
          [
            "convex",
            "run",
            `teamsRehearsal:${name}`,
            JSON.stringify(args),
            "--identity",
            JSON.stringify(identity),
          ],
          backend,
        ),
      );
    }
    function requireDenial(name, args, identity) {
      let rejected = false;
      try {
        invoke(name, args, identity);
      } catch (error) {
        const expected =
          name === "select"
            ? /Not authorized|Team not found/
            : identity.emailVerified === false
              ? /Verified email required/
              : /Membership no longer exists/;
        rejected = expected.test(String(error.stderr));
      }
      if (!rejected)
        throw new Error(`Expected ${name} to reject the identity.`);
    }
    const active = invoke(
      "select",
      { teamSlug: fixture.teamSlug },
      ownerIdentity,
    );
    const invite = invoke(
      "issue",
      { teamSlug: fixture.teamSlug, email: recipientIdentity.email },
      ownerIdentity,
    );
    requireDenial(
      "accept",
      { token: invite.token },
      { ...recipientIdentity, emailVerified: false },
    );
    invoke("accept", { token: invite.token }, recipientIdentity);
    invoke("select", { teamSlug: fixture.teamSlug }, recipientIdentity);
    invoke(
      "remove",
      { teamSlug: fixture.teamSlug, targetUserId: recipientIdentity.subject },
      ownerIdentity,
    );
    requireDenial("select", { teamSlug: fixture.teamSlug }, recipientIdentity);
    requireDenial("accept", { token: invite.token }, recipientIdentity);
    const replacement = invoke(
      "issue",
      { teamSlug: fixture.teamSlug, email: recipientIdentity.email },
      ownerIdentity,
    );
    invoke("accept", { token: replacement.token }, recipientIdentity);
    invoke(
      "transfer",
      { teamSlug: fixture.teamSlug, targetUserId: recipientIdentity.subject },
      ownerIdentity,
    );
    invoke(
      "removeTeam",
      { teamPublicId: active.teamPublicId },
      recipientIdentity,
    );
    requireDenial("select", { teamSlug: fixture.teamSlug }, recipientIdentity);
    console.log(
      "Native Feedtwin backend: identity, selection, verified acceptance, removal, transfer and deletion passed.",
    );
  }

  console.log(
    JSON.stringify({
      directory,
      source,
      package: `convex-teams@${archive.version}`,
      originalConsumerChanged: false,
    }),
  );
} catch (error) {
  console.error(`Rehearsal retained at ${directory}`);
  console.error(error.stdout?.toString() ?? error.message);
  console.error(error.stderr?.toString() ?? "");
  process.exitCode = 1;
}
