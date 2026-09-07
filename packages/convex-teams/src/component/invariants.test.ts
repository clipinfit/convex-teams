import type { FunctionReturnType } from "convex/server";
import { register as registerInvite } from "convex-invite/test";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, components, internal } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");
const setup = () => {
  const t = convexTest(schema, modules);
  registerInvite(t);
  return t;
};

test("acceptance preserves the owner membership", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  const invite = await t.mutation(api.invites.createInvite, {
    userId: "owner",
    teamSlug: team.teamSlug,
    email: "owner@example.com",
    role: "member",
  });
  const result = await t.mutation(api.invites.acceptInvite, {
    userId: "owner",
    email: "owner@example.com",
    token: invite.token,
  });
  expect(result.role).toBe("owner");
  const membership = await t.run((ctx) =>
    ctx.db
      .query("teamMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", "owner"))
      .first(),
  );
  expect(membership?.role).toBe("owner");
});

test("direct grants preserve existing membership authority", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  await t.mutation(api.teams.addMemberInternal, {
    teamId: await teamId(t, team.teamId),
    userId: "owner",
    role: "member",
  });
  const membership = await t.run((ctx) =>
    ctx.db.query("teamMemberships").first(),
  );
  expect(membership?.role).toBe("owner");
});

test("deletion selects each user's own fallback", async () => {
  const t = setup();
  await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Owner home",
  });
  const otherHome = await t.mutation(api.teams.createTeam, {
    userId: "other",
    teamName: "Other home",
  });
  const shared = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  await t.mutation(api.teams.addMemberInternal, {
    teamId: await teamId(t, shared.teamId),
    userId: "other",
    role: "member",
  });
  await t.mutation(api.teams.setActiveTeam, {
    userId: "other",
    teamSlug: shared.teamSlug,
  });
  await t.mutation(api.teams.deleteTeam, {
    userId: "owner",
    teamPublicId: shared.teamPublicId,
  });
  const preferences = await t.run((ctx) =>
    ctx.db
      .query("userTeamPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", "other"))
      .first(),
  );
  expect(preferences?.activeTeamId).toBe(otherHome.teamId);
});

async function teamId(t: ReturnType<typeof setup>, value: string) {
  return t.run(async (ctx) => {
    const id = ctx.db.normalizeId("teams", value);
    if (!id) throw new Error("Invalid team ID.");
    return id;
  });
}

test("capacity failure rolls back child acceptance and a later retry succeeds", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  const invite = await t.mutation(api.invites.createInvite, {
    userId: "owner",
    teamSlug: team.teamSlug,
    email: "new@example.com",
    role: "member",
  });
  const acceptance = {
    userId: "new",
    email: "new@example.com",
    token: invite.token,
    seatLimit: 1,
  };
  await expect(
    t.mutation(api.invites.acceptInvite, acceptance),
  ).rejects.toThrow("seat limit");
  const pending = await t.query(api.invites.listPending, {
    userId: "owner",
    teamSlug: team.teamSlug,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(pending.page).toHaveLength(1);
  await t.mutation(api.invites.acceptInvite, { ...acceptance, seatLimit: 2 });
  await t.mutation(api.invites.acceptInvite, { ...acceptance, seatLimit: 0 });
  const memberships = await t.run((ctx) =>
    ctx.db.query("teamMemberships").collect(),
  );
  expect(memberships).toHaveLength(2);
  expect(await t.run((ctx) => ctx.db.query("teams").collect())).toHaveLength(1);
});

test("direct grants enforce capacity and reject deleted teams", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  const id = await teamId(t, team.teamId);
  await expect(
    t.mutation(api.teams.addMemberInternal, {
      teamId: id,
      userId: "new",
      role: "member",
      seatLimit: 1,
    }),
  ).rejects.toThrow("seat limit");
  await expect(
    t.mutation(api.teams.addMemberInternal, {
      teamId: id,
      userId: "new",
      role: "member",
      seatLimit: -1,
    }),
  ).rejects.toThrow("nonnegative");
  await t.mutation(api.teams.deleteTeam, {
    userId: "owner",
    teamPublicId: team.teamPublicId,
  });
  await expect(
    t.mutation(api.teams.addMemberInternal, {
      teamId: id,
      userId: "new",
      role: "member",
    }),
  ).rejects.toThrow("Team not found");
});

test("ownership transfer is atomic and only the owner can delete", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  await t.mutation(api.teams.addMemberInternal, {
    teamId: await teamId(t, team.teamId),
    userId: "admin",
    role: "admin",
  });
  await expect(
    t.mutation(api.teams.deleteTeam, {
      userId: "admin",
      teamPublicId: team.teamPublicId,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    t.mutation(api.teams.transferOwnership, {
      userId: "admin",
      teamSlug: team.teamSlug,
      targetUserId: "admin",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    t.mutation(api.teams.transferOwnership, {
      userId: "owner",
      teamSlug: team.teamSlug,
      targetUserId: "missing",
    }),
  ).rejects.toThrow("Member not found");
  await t.mutation(api.teams.transferOwnership, {
    userId: "owner",
    teamSlug: team.teamSlug,
    targetUserId: "admin",
  });
  const members = await t.run((ctx) =>
    ctx.db.query("teamMemberships").collect(),
  );
  expect(
    members.filter((m) => m.role === "owner").map((m) => m.userId),
  ).toEqual(["admin"]);
  expect(
    (await t.run((ctx) => ctx.db.query("teams").first()))?.ownerUserId,
  ).toBe("admin");
  await expect(
    t.mutation(api.teams.leaveTeam, {
      userId: "admin",
      teamSlug: team.teamSlug,
    }),
  ).rejects.toThrow("owner");
  await expect(
    t.mutation(api.teams.updateMemberRole, {
      userId: "owner",
      teamSlug: team.teamSlug,
      targetUserId: "admin",
      role: "member",
    }),
  ).rejects.toThrow("owner");
});

test("recipient verification, resend invalidation, and revocation use the child lifecycle", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  const invite = await t.mutation(api.invites.createInvite, {
    userId: "owner",
    teamSlug: team.teamSlug,
    email: "new@example.com",
    role: "member",
  });
  await expect(
    t.mutation(api.invites.acceptInvite, {
      userId: "wrong",
      email: "wrong@example.com",
      token: invite.token,
    }),
  ).rejects.toThrow();
  const resent = await t.mutation(api.invites.resendInvite, {
    userId: "owner",
    inviteId: invite.inviteId,
  });
  await expect(
    t.mutation(api.invites.acceptInvite, {
      userId: "new",
      email: "new@example.com",
      token: invite.token,
    }),
  ).rejects.toThrow();
  await t.mutation(api.invites.revokeInvite, {
    userId: "owner",
    inviteId: resent.inviteId,
  });
  await expect(
    t.mutation(api.invites.acceptInvite, {
      userId: "new",
      email: "new@example.com",
      token: resent.token,
    }),
  ).rejects.toThrow();
});

test("accepted invitations cannot restore removed memberships", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  const invite = await t.mutation(api.invites.createInvite, {
    userId: "owner",
    teamSlug: team.teamSlug,
    email: "new@example.com",
    role: "member",
  });
  const acceptance = {
    userId: "new",
    email: "new@example.com",
    token: invite.token,
  };
  await t.mutation(api.invites.acceptInvite, acceptance);
  await t.mutation(api.teams.removeMember, {
    userId: "owner",
    teamSlug: team.teamSlug,
    targetUserId: "new",
  });
  await expect(
    t.mutation(api.invites.acceptInvite, acceptance),
  ).rejects.toThrow("Membership no longer exists");
  expect(await t.query(api.teams.getActiveTeam, { userId: "new" })).toBeNull();
});

test("a member can leave their last and default workspace", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  await t.mutation(api.teams.addMemberInternal, {
    teamId: await teamId(t, team.teamId),
    userId: "new",
    role: "member",
  });
  await t.mutation(api.teams.setActiveTeam, {
    userId: "new",
    teamSlug: team.teamSlug,
  });
  const result = await t.mutation(api.teams.leaveTeam, {
    userId: "new",
    teamSlug: team.teamSlug,
  });
  expect(result.redirectTeamPublicId).toBeNull();
  expect(await t.query(api.teams.getDefaultTeam, { userId: "new" })).toBeNull();
});

test("personal bootstrap is distinct from a shared default workspace", async () => {
  const t = setup();
  const shared = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  const first = await t.mutation(api.teams.ensurePersonalTeam, {
    userId: "owner",
  });
  const second = await t.mutation(api.teams.ensurePersonalTeam, {
    userId: "owner",
  });
  expect(first.defaultTeamId).toBe(second.defaultTeamId);
  expect(first.defaultTeamId).not.toBe(shared.teamId);
  expect(await t.run((ctx) => ctx.db.query("teams").collect())).toHaveLength(2);
});

test("deletion cleanup crosses batches, denies stale access, and tolerates retries", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Large",
  });
  const id = await teamId(t, team.teamId);
  await t.run(async (ctx) => {
    for (let i = 0; i < 125; i++) {
      await ctx.db.insert("teamMemberships", {
        teamId: id,
        userId: `member-${i}`,
        role: "member",
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert("userTeamPreferences", {
        userId: `member-${i}`,
        activeTeamId: id,
        defaultTeamId: id,
        createdAt: 0,
        updatedAt: 0,
      });
    }
  });
  await t.mutation(api.teams.deleteTeam, {
    userId: "owner",
    teamPublicId: team.teamPublicId,
  });
  expect(
    await t.query(api.teams.getBySlug, {
      userId: "member-124",
      teamSlug: team.teamSlug,
    }),
  ).toBeNull();
  expect(
    await t.query(api.teams.getActiveTeam, { userId: "member-124" }),
  ).toBeNull();
  await t.finishInProgressScheduledFunctions();
  // Retry the continuation even after its work has finished.
  await t.mutation(internal.teams.cleanupDeletedTeamInternal, { teamId: id });
  await t.mutation(internal.teams.cleanupDeletedTeamInternal, { teamId: id });
  expect(
    await t.run((ctx) => ctx.db.query("teamMemberships").collect()),
  ).toHaveLength(0);
  const prefs = await t.run((ctx) =>
    ctx.db.query("userTeamPreferences").collect(),
  );
  expect(
    prefs.every(
      (p) => p.activeTeamId === undefined && p.defaultTeamId === undefined,
    ),
  ).toBe(true);
  expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
});

test("invitation scope and role cannot grant membership outside the teams contract", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  for (const fixture of [
    { scope: "other", role: "member" },
    { scope: "teams", role: "owner" },
  ]) {
    const invitation = await t.run((ctx) =>
      ctx.runMutation(components.invite.invitations.issue, {
        ...fixture,
        resourceRef: team.teamPublicId,
        audienceRef: "new@example.com",
        dedupeKey: fixture.scope,
        ttlMs: 60000,
      }),
    );
    await expect(
      t.mutation(api.invites.acceptInvite, {
        userId: "new",
        email: "new@example.com",
        token: invitation.token,
      }),
    ).rejects.toThrow("Invalid invitation");
  }
  expect(
    await t.run((ctx) => ctx.db.query("teamMemberships").collect()),
  ).toHaveLength(1);
});

test("invitation expiry prevents grants and deletion invalidates pending invitations", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Shared",
  });
  const expired = await t.run((ctx) =>
    ctx.runMutation(components.invite.invitations.issue, {
      scope: "teams",
      role: "member",
      resourceRef: team.teamPublicId,
      audienceRef: "new@example.com",
      dedupeKey: "expiry",
      ttlMs: 1,
    }),
  );
  vi.spyOn(Date, "now").mockReturnValue(expired.expiresAt + 1);
  try {
    await expect(
      t.mutation(api.invites.acceptInvite, {
        userId: "new",
        email: "new@example.com",
        token: expired.token,
      }),
    ).rejects.toThrow();
  } finally {
    vi.restoreAllMocks();
  }
  const pending = await t.mutation(api.invites.createInvite, {
    userId: "owner",
    teamSlug: team.teamSlug,
    email: "pending@example.com",
    role: "member",
  });
  await t.mutation(api.teams.deleteTeam, {
    userId: "owner",
    teamPublicId: team.teamPublicId,
  });
  await expect(
    t.mutation(api.invites.acceptInvite, {
      userId: "pending",
      email: "pending@example.com",
      token: pending.token,
    }),
  ).rejects.toThrow("Team not found");
});

test("team listing pages through memberships and rejects oversized requests", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 135; i++) {
      const id = await ctx.db.insert("teams", {
        teamName: `Team ${i}`,
        teamSlug: `team-${i}`,
        teamPublicId: `public-${i}`,
        ownerUserId: "owner",
        status: i < 30 ? "deleted" : "active",
        createdAt: i,
        updatedAt: i,
      });
      await ctx.db.insert("teamMemberships", {
        teamId: id,
        userId: "owner",
        role: "owner",
        createdAt: i,
        updatedAt: i,
      });
    }
  });
  let cursor: string | null = null;
  const visible: string[] = [];
  let pages = 0;
  while (true) {
    const result: FunctionReturnType<typeof api.teams.listForUser> =
      await t.query(api.teams.listForUser, {
        userId: "owner",
        paginationOpts: { numItems: 30, cursor },
      });
    pages++;
    expect(result.page.length).toBeLessThanOrEqual(30);
    visible.push(...result.page.map((team) => team.teamPublicId));
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(pages).toBeGreaterThan(1);
  expect(visible).toHaveLength(105);
  expect(new Set(visible).size).toBe(105);
  await expect(
    t.query(api.teams.listForUser, {
      userId: "owner",
      paginationOpts: { numItems: 101, cursor: null },
    }),
  ).rejects.toThrow("Page size");
  const outsider = await t.query(api.teams.listForUser, {
    userId: "outsider",
    paginationOpts: { numItems: 100, cursor: null },
  });
  expect(outsider.page).toEqual([]);
});

async function fallbackFixture(t: ReturnType<typeof setup>) {
  return t.run(async (ctx) => {
    for (let i = 0; i < 60; i++) {
      const id = await ctx.db.insert("teams", {
        teamName: `Deleted ${i}`,
        teamSlug: `deleted-${i}`,
        teamPublicId: `deleted-${i}`,
        ownerUserId: "owner",
        status: "deleted",
        createdAt: i,
        updatedAt: i,
      });
      await ctx.db.insert("teamMemberships", {
        teamId: id,
        userId: "user",
        role: "member",
        createdAt: i,
        updatedAt: i,
      });
    }
    const home = await ctx.db.insert("teams", {
      teamName: "Home",
      teamSlug: "home",
      teamPublicId: "home",
      ownerUserId: "user",
      status: "active",
      personalOwnerUserId: "user",
      createdAt: 61,
      updatedAt: 61,
    });
    await ctx.db.insert("teamMemberships", {
      teamId: home,
      userId: "user",
      role: "owner",
      createdAt: 61,
      updatedAt: 61,
    });
    await ctx.db.insert("userTeamPreferences", {
      userId: "user",
      createdAt: 0,
      updatedAt: 0,
    });
    return home;
  });
}

test("fallback repair continues beyond its first page", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    const home = await fallbackFixture(t);
    await t.mutation(internal.teams.repairPreferencesInternal, {
      userId: "user",
      cursor: null,
    });
    expect(
      await t.query(api.teams.getActiveTeam, { userId: "user" }),
    ).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await t.query(api.teams.getActiveTeam, { userId: "user" }))?.teamId,
    ).toBe(home);
  } finally {
    vi.useRealTimers();
  }
});

test("a later explicit selection wins over scheduled fallback repair", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    await fallbackFixture(t);
    await t.mutation(internal.teams.repairPreferencesInternal, {
      userId: "user",
      cursor: null,
    });
    const chosen = await t.mutation(api.teams.createTeam, {
      userId: "user",
      teamName: "Chosen",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await t.query(api.teams.getActiveTeam, { userId: "user" }))?.teamId,
    ).toBe(chosen.teamId);
  } finally {
    vi.useRealTimers();
  }
});

test("bootstrap never uses a stale preference as an access grant", async () => {
  const t = setup();
  const home = await fallbackFixture(t);
  const outsider = await t.mutation(api.teams.createTeam, {
    userId: "outsider",
    teamName: "Private",
  });
  const outsiderId = await teamId(t, outsider.teamId);
  await t.run(async (ctx) => {
    const pref = await ctx.db
      .query("userTeamPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", "user"))
      .unique();
    if (!pref) throw new Error("Missing fixture preference.");
    await ctx.db.patch(pref._id, {
      activeTeamId: outsiderId,
      defaultTeamId: outsiderId,
    });
  });
  const result = await t.mutation(api.teams.ensurePersonalTeam, {
    userId: "user",
  });
  expect(result.activeTeamId).toBe(home);
  expect(result.defaultTeamId).toBe(home);
});

test("membership counts track grants, retries, removal, leave, and ownership transfer", async () => {
  const t = setup();
  const team = await t.mutation(api.teams.createTeam, {
    userId: "owner",
    teamName: "Counted",
  });
  const id = await teamId(t, team.teamId);
  const count = async () =>
    (await t.run((ctx) => ctx.db.get(id)))?.membershipCount;
  expect(await count()).toEqual({ kind: "ready", value: 1 });
  for (const userId of ["first", "second"]) {
    await t.mutation(api.teams.addMemberInternal, {
      teamId: id,
      userId,
      role: "member",
      seatLimit: Number.MAX_SAFE_INTEGER,
    });
  }
  await t.mutation(api.teams.addMemberInternal, {
    teamId: id,
    userId: "first",
    role: "admin",
    seatLimit: 0,
  });
  expect(await count()).toEqual({ kind: "ready", value: 3 });
  await expect(
    t.mutation(api.teams.addMemberInternal, {
      teamId: id,
      userId: "third",
      role: "member",
      seatLimit: 3,
    }),
  ).rejects.toThrow("seat limit");
  expect(await count()).toEqual({ kind: "ready", value: 3 });
  await t.mutation(api.teams.transferOwnership, {
    userId: "owner",
    teamSlug: team.teamSlug,
    targetUserId: "first",
  });
  expect(await count()).toEqual({ kind: "ready", value: 3 });
  await t.mutation(api.teams.removeMember, {
    userId: "first",
    teamSlug: team.teamSlug,
    targetUserId: "second",
  });
  await t.mutation(api.teams.leaveTeam, {
    userId: "owner",
    teamSlug: team.teamSlug,
  });
  expect(await count()).toEqual({ kind: "ready", value: 1 });
  await t.mutation(api.teams.addMemberInternal, {
    teamId: id,
    userId: "third",
    role: "member",
    seatLimit: 2,
  });
  expect(await count()).toEqual({ kind: "ready", value: 2 });
});

test("legacy count migration is bounded, owner-only, and restarts after removal", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    const team = await t.mutation(api.teams.createTeam, {
      userId: "owner",
      teamName: "Legacy",
    });
    const id = await teamId(t, team.teamId);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { membershipCount: undefined });
      for (let i = 0; i < 250; i++)
        await ctx.db.insert("teamMemberships", {
          teamId: id,
          userId: `legacy-${i}`,
          role: "member",
          createdAt: i,
          updatedAt: i,
        });
    });
    await expect(
      t.mutation(api.teams.prepareMembershipCount, {
        userId: "legacy-0",
        teamSlug: team.teamSlug,
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      t.mutation(api.teams.addMemberInternal, {
        teamId: id,
        userId: "new",
        role: "member",
      }),
    ).rejects.toThrow("Membership count is not ready");
    expect(
      await t.mutation(api.teams.prepareMembershipCount, {
        userId: "owner",
        teamSlug: team.teamSlug,
      }),
    ).toBe("counting");
    await t.mutation(internal.teams.countMembershipsInternal, { teamId: id });
    const progress = (await t.run((ctx) => ctx.db.get(id)))?.membershipCount;
    expect(progress?.kind).toBe("counting");
    if (progress?.kind !== "counting")
      throw new Error("Expected a partial count.");
    expect(progress.total).toBe(100);
    expect(
      await t.mutation(api.teams.prepareMembershipCount, {
        userId: "owner",
        teamSlug: team.teamSlug,
      }),
    ).toBe("counting");
    expect((await t.run((ctx) => ctx.db.get(id)))?.membershipCount).toEqual(
      progress,
    );
    await t.mutation(api.teams.removeMember, {
      userId: "owner",
      teamSlug: team.teamSlug,
      targetUserId: "legacy-0",
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.membershipCount).toEqual({
      kind: "counting",
      cursor: null,
      total: 0,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(id)))?.membershipCount).toEqual({
      kind: "ready",
      value: 250,
    });
    expect(
      await t.mutation(api.teams.prepareMembershipCount, {
        userId: "owner",
        teamSlug: team.teamSlug,
      }),
    ).toBe("ready");
    // Duplicate delivery of a completed count job cannot overwrite a later grant.
    await t.mutation(api.teams.addMemberInternal, {
      teamId: id,
      userId: "new",
      role: "member",
      seatLimit: 251,
    });
    await t.mutation(internal.teams.countMembershipsInternal, { teamId: id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.membershipCount).toEqual({
      kind: "ready",
      value: 251,
    });
  } finally {
    vi.useRealTimers();
  }
});

test("an invitation remains usable after legacy count preparation and capacity rollback", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    const team = await t.mutation(api.teams.createTeam, {
      userId: "owner",
      teamName: "Legacy invite",
    });
    const id = await teamId(t, team.teamId);
    await t.run((ctx) => ctx.db.patch(id, { membershipCount: undefined }));
    const invite = await t.mutation(api.invites.createInvite, {
      userId: "owner",
      teamSlug: team.teamSlug,
      email: "new@example.com",
      role: "member",
    });
    const args = {
      userId: "new",
      email: "new@example.com",
      token: invite.token,
    };
    await expect(t.mutation(api.invites.acceptInvite, args)).rejects.toThrow(
      "Membership count is not ready",
    );
    await t.mutation(api.teams.prepareMembershipCount, {
      userId: "owner",
      teamSlug: team.teamSlug,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      t.mutation(api.invites.acceptInvite, { ...args, seatLimit: 1 }),
    ).rejects.toThrow("seat limit");
    expect((await t.run((ctx) => ctx.db.get(id)))?.membershipCount).toEqual({
      kind: "ready",
      value: 1,
    });
    await t.mutation(api.invites.acceptInvite, { ...args, seatLimit: 2 });
    await t.mutation(api.invites.acceptInvite, { ...args, seatLimit: 2 });
    expect((await t.run((ctx) => ctx.db.get(id)))?.membershipCount).toEqual({
      kind: "ready",
      value: 2,
    });
  } finally {
    vi.useRealTimers();
  }
});

test("deletion during count preparation leaves no stale count job writes", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    const team = await t.mutation(api.teams.createTeam, {
      userId: "owner",
      teamName: "Legacy deletion",
    });
    const id = await teamId(t, team.teamId);
    await t.run((ctx) => ctx.db.patch(id, { membershipCount: undefined }));
    await t.mutation(api.teams.prepareMembershipCount, {
      userId: "owner",
      teamSlug: team.teamSlug,
    });
    await t.mutation(api.teams.deleteTeam, {
      userId: "owner",
      teamPublicId: team.teamPublicId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("duplicate long names get bounded valid slugs without sequential scans", async () => {
  const t = setup();
  const name = `${"x".repeat(59)} more`;
  const first = await t.mutation(api.teams.createTeam, {
    userId: "one",
    teamName: name,
  });
  const second = await t.mutation(api.teams.createTeam, {
    userId: "two",
    teamName: name,
  });
  expect(first.teamSlug).toBe("x".repeat(59));
  expect(second.teamSlug).toMatch(/^x{47}-[a-f0-9]{12}$/);
  expect(second.teamSlug.length).toBeLessThanOrEqual(60);
  expect(first.teamSlug).not.toBe(second.teamSlug);
});

test("slug collisions exhaust a fixed attempt budget without creating a team", async () => {
  const t = setup();
  for (const teamSlug of ["collision", "collision-aaaaaaaaaaaa"]) {
    await t.run((ctx) =>
      ctx.db.insert("teams", {
        teamName: "Collision",
        teamSlug,
        teamPublicId: teamSlug,
        ownerUserId: "other",
        status: "active",
        membershipCount: { kind: "ready", value: 0 },
        createdAt: 0,
        updatedAt: 0,
      }),
    );
  }
  const random = vi
    .spyOn(crypto, "randomUUID")
    .mockReturnValue("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  try {
    await expect(
      t.mutation(api.teams.createTeam, {
        userId: "new",
        teamName: "Collision",
      }),
    ).rejects.toThrow("Could not allocate a unique team slug");
    expect(random).toHaveBeenCalledTimes(4);
    expect(await t.run((ctx) => ctx.db.query("teams").collect())).toHaveLength(
      2,
    );
  } finally {
    random.mockRestore();
  }
  const retry = await t.mutation(api.teams.createTeam, {
    userId: "new",
    teamName: "Collision",
  });
  expect(retry.teamSlug).toMatch(/^collision-[a-f0-9]{12}$/);
});

test("personal workspace slug collisions are bounded and failed bootstrap is atomic", async () => {
  const t = setup();
  await t.run((ctx) =>
    ctx.db.insert("teams", {
      teamName: "Existing",
      teamSlug: "personal-aaaaaaaaaaaa",
      teamPublicId: "existing",
      ownerUserId: "other",
      status: "active",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  const random = vi
    .spyOn(crypto, "randomUUID")
    .mockReturnValue("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  try {
    await expect(
      t.mutation(api.teams.ensurePersonalTeam, {
        userId: "new",
        name: "Personal",
      }),
    ).rejects.toThrow("Could not allocate a unique team slug");
    expect(random).toHaveBeenCalledTimes(5);
    expect(
      await t.run((ctx) => ctx.db.query("userTeamPreferences").collect()),
    ).toHaveLength(0);
  } finally {
    random.mockRestore();
  }
  const result = await t.mutation(api.teams.ensurePersonalTeam, {
    userId: "new",
    name: "Personal",
  });
  const id = await teamId(t, result.defaultTeamId);
  expect((await t.run((ctx) => ctx.db.get(id)))?.membershipCount).toEqual({
    kind: "ready",
    value: 1,
  });
});
