import { register as registerInvite } from "convex-invite/test";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  registerInvite(t);
  return t;
}
const snapshot = {
  teamPublicId: "feedtwin-stable",
  teamSlug: "feedtwin",
  teamName: "Feedtwin",
  ownerUserId: "owner",
  personal: false,
  expectedMemberCount: 202,
};

test("bounded imports preserve IDs, count members once, and close repeatably", async () => {
  const t = setup();
  const first = await t.mutation(api.imports.begin, snapshot);
  expect(await t.mutation(api.imports.begin, snapshot)).toEqual(first);
  await expect(
    t.mutation(api.imports.finish, { teamPublicId: snapshot.teamPublicId }),
  ).rejects.toThrow("count does not match");
  const members = Array.from({ length: 201 }, (_, i) => ({
    userId: `member-${i}`,
    role: "member" as const,
  }));
  await expect(
    t.mutation(api.imports.members, {
      teamPublicId: snapshot.teamPublicId,
      members,
    }),
  ).rejects.toThrow("1 to 100");
  for (let i = 0; i < members.length; i += 100) {
    const batch = {
      teamPublicId: snapshot.teamPublicId,
      members: members.slice(i, i + 100),
    };
    await t.mutation(api.imports.members, batch);
    await t.mutation(api.imports.members, batch);
  }
  expect(
    await t.mutation(api.imports.finish, {
      teamPublicId: snapshot.teamPublicId,
    }),
  ).toBe(first.teamId);
  expect(
    await t.mutation(api.imports.finish, {
      teamPublicId: snapshot.teamPublicId,
    }),
  ).toBe(first.teamId);
  expect(await t.mutation(api.imports.begin, snapshot)).toEqual({
    ...first,
    status: "complete",
  });
  const team = await t.run((ctx) => ctx.db.get(first.teamId));
  expect(team?.teamPublicId).toBe(snapshot.teamPublicId);
  expect(team?.membershipCount).toEqual({ kind: "ready", value: 202 });
  await expect(
    t.mutation(api.imports.members, {
      teamPublicId: snapshot.teamPublicId,
      members: members.slice(0, 1),
    }),
  ).rejects.toThrow("not open");
});

test("conflicting identities and roles fail without partial batch writes", async () => {
  const t = setup();
  const first = await t.mutation(api.imports.begin, snapshot);
  await expect(
    t.mutation(api.imports.begin, { ...snapshot, ownerUserId: "different" }),
  ).rejects.toThrow("snapshot conflicts");
  await expect(
    t.mutation(api.imports.begin, { ...snapshot, teamPublicId: "other" }),
  ).rejects.toThrow("identifier conflicts");
  await t.mutation(api.imports.members, {
    teamPublicId: snapshot.teamPublicId,
    members: [{ userId: "existing", role: "member" }],
  });
  for (const conflicting of [
    { userId: "existing", role: "admin" as const },
    { userId: "intruder", role: "owner" as const },
    { userId: "owner", role: "member" as const },
  ]) {
    await expect(
      t.mutation(api.imports.members, {
        teamPublicId: snapshot.teamPublicId,
        members: [{ userId: "new", role: "member" }, conflicting],
      }),
    ).rejects.toThrow(/conflict/);
  }
  expect(
    await t.run((ctx) => ctx.db.query("teamMemberships").collect()),
  ).toHaveLength(2);
  expect(
    (await t.run((ctx) => ctx.db.get(first.teamId)))?.membershipCount,
  ).toEqual({ kind: "ready", value: 2 });
  await expect(
    t.mutation(api.imports.members, {
      teamPublicId: snapshot.teamPublicId,
      members: [
        { userId: "duplicate", role: "member" },
        { userId: "duplicate", role: "member" },
      ],
    }),
  ).rejects.toThrow("Duplicate");
});

test("closed imports cannot restore removed members or deleted teams", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    const args = { ...snapshot, expectedMemberCount: 2 };
    const first = await t.mutation(api.imports.begin, args);
    const batch = {
      teamPublicId: snapshot.teamPublicId,
      members: [{ userId: "member", role: "member" as const }],
    };
    await t.mutation(api.imports.members, batch);
    await t.mutation(api.imports.finish, {
      teamPublicId: snapshot.teamPublicId,
    });
    await t.mutation(api.teams.removeMember, {
      userId: "owner",
      teamSlug: snapshot.teamSlug,
      targetUserId: "member",
    });
    await expect(t.mutation(api.imports.members, batch)).rejects.toThrow(
      "not open",
    );
    expect(
      (await t.run((ctx) => ctx.db.get(first.teamId)))?.membershipCount,
    ).toEqual({ kind: "ready", value: 1 });
    await t.mutation(api.teams.deleteTeam, {
      userId: "owner",
      teamPublicId: snapshot.teamPublicId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.mutation(api.imports.begin, args)).rejects.toThrow(
      "deleted",
    );
    await expect(
      t.mutation(api.imports.finish, { teamPublicId: snapshot.teamPublicId }),
    ).rejects.toThrow("deleted");
    expect(await t.run((ctx) => ctx.db.get(first.teamId))).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.query("teamImports").collect()),
    ).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

test("imports validate counts and identifiers and preserve personal classification", async () => {
  const t = setup();
  for (const expectedMemberCount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    await expect(
      t.mutation(api.imports.begin, { ...snapshot, expectedMemberCount }),
    ).rejects.toThrow("member count");
  await expect(
    t.mutation(api.imports.begin, { ...snapshot, teamPublicId: " " }),
  ).rejects.toThrow("public ID");
  await expect(
    t.mutation(api.imports.begin, { ...snapshot, teamSlug: "bad slug" }),
  ).rejects.toThrow("slug");
  const personal = { ...snapshot, personal: true, expectedMemberCount: 1 };
  const first = await t.mutation(api.imports.begin, personal);
  await expect(
    t.mutation(api.imports.members, {
      teamPublicId: snapshot.teamPublicId,
      members: [{ userId: "extra", role: "member" }],
    }),
  ).rejects.toThrow("seat limit");
  await t.mutation(api.imports.finish, { teamPublicId: snapshot.teamPublicId });
  expect(
    (await t.run((ctx) => ctx.db.get(first.teamId)))?.personalOwnerUserId,
  ).toBe("owner");
  await expect(
    t.mutation(api.imports.begin, {
      ...personal,
      teamPublicId: "other",
      teamSlug: "other",
    }),
  ).rejects.toThrow("Personal workspace");
});

test("trusted team state follows ownership and denies deleted workspace state", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    expect(
      await t.query(api.teams.getTeamState, { teamPublicId: "missing" }),
    ).toBeNull();
    const team = await t.mutation(api.imports.begin, {
      ...snapshot,
      expectedMemberCount: 2,
    });
    await t.mutation(api.imports.members, {
      teamPublicId: snapshot.teamPublicId,
      members: [{ userId: "successor", role: "member" }],
    });
    await t.mutation(api.imports.finish, {
      teamPublicId: snapshot.teamPublicId,
    });
    expect(
      (
        await t.query(api.teams.getTeamState, {
          teamPublicId: snapshot.teamPublicId,
        })
      )?.teamId,
    ).toBe(team.teamId);
    await t.mutation(api.teams.transferOwnership, {
      userId: "owner",
      teamSlug: snapshot.teamSlug,
      targetUserId: "successor",
    });
    expect(
      (
        await t.query(api.teams.getTeamState, {
          teamPublicId: snapshot.teamPublicId,
        })
      )?.ownerUserId,
    ).toBe("successor");
    await t.mutation(api.teams.deleteTeam, {
      userId: "successor",
      teamPublicId: snapshot.teamPublicId,
    });
    expect(
      await t.query(api.teams.getTeamState, {
        teamPublicId: snapshot.teamPublicId,
      }),
    ).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await t.query(api.teams.getTeamState, {
        teamPublicId: snapshot.teamPublicId,
      }),
    ).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
