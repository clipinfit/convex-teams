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
