import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Read-only production inventory. Never print user IDs, emails, tokens, or rows.
const backend = resolve(
  process.argv[2] ??
    resolve(import.meta.dirname, "../../feedtwin/packages/backend"),
);
const limit = 1001;
function read(table) {
  let output;
  try {
    output = execFileSync(
      "bunx",
      [
        "convex",
        "data",
        table,
        "--prod",
        "--limit",
        String(limit),
        "--format",
        "json",
      ],
      {
        cwd: backend,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    throw new Error(
      `Production inventory failed for ${table}; no row data printed.`,
    );
  }
  // The Convex CLI prints an empty string for an empty table.
  const rows = output.trim() ? JSON.parse(output) : [];
  assert(
    Array.isArray(rows) && rows.length < limit,
    `Incomplete inventory for ${table}`,
  );
  return rows;
}
const tables = Object.fromEntries(
  [
    "teams",
    "teamMemberships",
    "teamInvites",
    "projectInvites",
    "projectMemberships",
    "userTeamPreferences",
    "projects",
    "teamEntitlements",
  ].map((name) => [name, read(name)]),
);
function counts(rows, field) {
  const result = {};
  for (const row of rows)
    result[row[field] ?? "missing"] =
      (result[row[field] ?? "missing"] ?? 0) + 1;
  return result;
}
const { teams, teamMemberships: members, teamInvites, projectInvites } = tables;
const teamIds = new Set(teams.map((team) => team._id));
const ownershipValid = teams.every((team) => {
  const owners = members.filter(
    (member) => member.teamId === team._id && member.role === "owner",
  );
  return owners.length === 1 && owners[0].userId === team.ownerUserId;
});
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      environment: "production",
      readOnly: true,
      counts: Object.fromEntries(
        Object.entries(tables).map(([name, rows]) => [name, rows.length]),
      ),
      distinctTeamUsers: new Set(members.map((member) => member.userId)).size,
      teamStatuses: counts(teams, "status"),
      teamInviteStatuses: counts(teamInvites, "status"),
      projectInviteStatuses: counts(projectInvites, "status"),
      ownershipValid,
      duplicatePublicIds:
        teams.length - new Set(teams.map((team) => team.teamPublicId)).size,
      duplicateMemberships:
        members.length -
        new Set(
          members.map((member) =>
            JSON.stringify([member.teamId, member.userId]),
          ),
        ).size,
      orphanMemberships: members.filter((member) => !teamIds.has(member.teamId))
        .length,
      outstandingInvitations: [...teamInvites, ...projectInvites].filter(
        (invite) => !["accepted", "revoked", "expired"].includes(invite.status),
      ).length,
    },
    null,
    2,
  ),
);
