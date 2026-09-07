/** Local development proof. These functions are internal and never accept public actor IDs. */
import { type Infer, v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { internalAction, internalMutation } from "./_generated/server.js";

export const setup = internalMutation({
  args: {},
  returns: v.object({
    teamId: v.string(),
    teamSlug: v.string(),
    token: v.string(),
    owner: v.string(),
  }),
  handler: async (ctx) => {
    const owner = crypto.randomUUID();
    const team = await ctx.runMutation(components.teams.teams.createTeam, {
      userId: owner,
      teamName: "Concurrency proof",
    });
    const invite = await ctx.runMutation(
      components.teams.invites.createInvite,
      {
        userId: owner,
        teamSlug: team.teamSlug,
        email: "invitee@example.com",
        role: "member",
      },
    );
    return {
      teamId: team.teamId,
      teamSlug: team.teamSlug,
      token: invite.token,
      owner,
    };
  },
});

export const direct = internalMutation({
  args: { teamId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(components.teams.teams.addMemberInternal, {
      ...args,
      userId: "direct",
      role: "member",
      seatLimit: 2,
    });
    return null;
  },
});

export const invited = internalMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(components.teams.invites.acceptInvite, {
      ...args,
      userId: "invitee",
      email: "invitee@example.com",
      seatLimit: 2,
    });
    return null;
  },
});

const proofResult = v.object({
  successfulGrants: v.number(),
  rejectedGrants: v.number(),
  memberCount: v.number(),
});

export const run = internalAction({
  args: {},
  returns: proofResult,
  handler: async (ctx): Promise<Infer<typeof proofResult>> => {
    const fixture = await ctx.runMutation(internal.proof.setup, {});
    const results = await Promise.allSettled([
      ctx.runMutation(internal.proof.direct, { teamId: fixture.teamId }),
      ctx.runMutation(internal.proof.invited, { token: fixture.token }),
    ]);
    const members = await ctx.runQuery(components.teams.teams.listMembers, {
      userId: fixture.owner,
      teamSlug: fixture.teamSlug,
      paginationOpts: { numItems: 10, cursor: null },
    });
    await ctx.runQuery(components.teams.invites.listPending, {
      userId: fixture.owner,
      teamSlug: fixture.teamSlug,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const successfulGrants = results.filter(
      (r) => r.status === "fulfilled",
    ).length;
    if (successfulGrants !== 1 || members?.page.length !== 2)
      throw new Error("Concurrent seat invariant failed.");
    return {
      successfulGrants,
      rejectedGrants: 2 - successfulGrants,
      memberCount: members.page.length,
    };
  },
});

export const bootstrap = internalMutation({
  args: { userId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(
      components.teams.teams.ensurePersonalTeam,
      args,
    );
    return result.defaultTeamId;
  },
});

export const duplicateGrant = internalMutation({
  args: { teamId: v.string(), userId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(
      components.teams.teams.addMemberInternal,
      {
        ...args,
        role: "member",
        seatLimit: 2,
      },
    );
    return result.membershipId;
  },
});

const bootstrapResult = v.object({
  personalTeamCount: v.number(),
  sameTeamId: v.boolean(),
});
export const concurrentBootstrap = internalAction({
  args: {},
  returns: bootstrapResult,
  handler: async (ctx): Promise<Infer<typeof bootstrapResult>> => {
    const userId = crypto.randomUUID();
    const ids = await Promise.all([
      ctx.runMutation(internal.proof.bootstrap, { userId }),
      ctx.runMutation(internal.proof.bootstrap, { userId }),
    ]);
    const teams = await ctx.runQuery(components.teams.teams.listForUser, {
      userId,
    });
    if (ids[0] !== ids[1] || teams.length !== 1)
      throw new Error("Concurrent bootstrap invariant failed.");
    return { personalTeamCount: teams.length, sameTeamId: ids[0] === ids[1] };
  },
});

const duplicateResult = v.object({
  memberCount: v.number(),
  sameMembershipId: v.boolean(),
});
export const concurrentDuplicateGrant = internalAction({
  args: {},
  returns: duplicateResult,
  handler: async (ctx): Promise<Infer<typeof duplicateResult>> => {
    const fixture = await ctx.runMutation(internal.proof.setup, {});
    const args = { teamId: fixture.teamId, userId: crypto.randomUUID() };
    const ids = await Promise.all([
      ctx.runMutation(internal.proof.duplicateGrant, args),
      ctx.runMutation(internal.proof.duplicateGrant, args),
    ]);
    const members = await ctx.runQuery(components.teams.teams.listMembers, {
      userId: fixture.owner,
      teamSlug: fixture.teamSlug,
      paginationOpts: { numItems: 10, cursor: null },
    });
    if (ids[0] !== ids[1] || members?.page.length !== 2)
      throw new Error("Concurrent duplicate grant invariant failed.");
    return {
      memberCount: members.page.length,
      sameMembershipId: ids[0] === ids[1],
    };
  },
});
