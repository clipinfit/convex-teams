/** Team authorization and membership grants. convex-invite owns the lifecycle. */
import { paginationOptsValidator } from "convex/server";
import { type Infer, v } from "convex/values";
import { Invitations } from "convex-invite";
import { components, internal } from "./_generated/api.js";
import { mutation, type QueryCtx, query } from "./_generated/server.js";
import { grantMembership } from "./lib/membership.js";
import { boundedPagination } from "./lib/pagination.js";
import { getLiveTeamBySlug } from "./lib/teams.js";

const invitations = new Invitations(components.invite);
const scope = "teams";
const roleValidator = v.union(v.literal("admin"), v.literal("member"));

function parseRole(role: unknown): Infer<typeof roleValidator> {
  if (role !== "admin" && role !== "member")
    throw new Error("Invalid invitation role.");
  return role;
}

async function requireManager(
  ctx: QueryCtx,
  userId: string,
  resourceRef: string,
) {
  const team = await ctx.db
    .query("teams")
    .withIndex("by_teamPublicId", (q) => q.eq("teamPublicId", resourceRef))
    .unique();
  if (!team || team.status === "deleted") throw new Error("Team not found.");
  const member = await ctx.db
    .query("teamMemberships")
    .withIndex("by_teamId_userId", (q) =>
      q.eq("teamId", team._id).eq("userId", userId),
    )
    .unique();
  if (!member || member.role === "member") throw new Error("Not authorized.");
  return team;
}

export const createInvite = mutation({
  args: {
    userId: v.string(),
    teamSlug: v.string(),
    email: v.string(),
    role: roleValidator,
  },
  returns: v.object({
    inviteId: v.string(),
    token: v.string(),
    email: v.string(),
    role: roleValidator,
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) throw new Error("Team not found.");
    await requireManager(ctx, args.userId, team.teamPublicId);
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email address is required.");
    const issued = await invitations.issue(ctx, {
      scope,
      resourceRef: team.teamPublicId,
      inviterRef: args.userId,
      audienceRef: email,
      dedupeKey: JSON.stringify([team.teamPublicId, email]),
      role: args.role,
    });
    return {
      inviteId: issued.invitationId,
      token: issued.token,
      expiresAt: issued.expiresAt,
      email,
      role: args.role,
    };
  },
});

export const acceptInvite = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    token: v.string(),
    seatLimit: v.optional(v.number()),
  },
  returns: v.object({
    teamId: v.string(),
    teamPublicId: v.string(),
    teamSlug: v.string(),
    role: v.union(v.literal("owner"), roleValidator),
  }),
  handler: async (ctx, args) => {
    const invitation = await invitations.getEffectiveByToken(ctx, {
      token: args.token,
    });
    if (invitation.scope !== scope)
      throw new Error("Invalid invitation scope.");
    const role = parseRole(invitation.role);
    const team = await ctx.db
      .query("teams")
      .withIndex("by_teamPublicId", (q) =>
        q.eq("teamPublicId", invitation.resourceRef),
      )
      .unique();
    if (!team || team.status === "deleted") throw new Error("Team not found.");
    // Child acceptance and membership creation roll back together on any error.
    const grant = await invitations.accept(ctx, {
      token: args.token,
      acceptedBy: args.userId,
      audienceRef: args.email.trim().toLowerCase(),
    });
    // An accepted invitation must never restore a removed membership.
    if (invitation.state === "accepted") {
      const existing = await ctx.db
        .query("teamMemberships")
        .withIndex("by_teamId_userId", (q) =>
          q.eq("teamId", team._id).eq("userId", args.userId),
        )
        .unique();
      if (!existing) throw new Error("Membership no longer exists.");
      return {
        teamId: team._id,
        teamPublicId: team.teamPublicId,
        teamSlug: team.teamSlug,
        role: existing.role,
      };
    }
    const membership = await grantMembership(ctx, {
      teamId: team._id,
      userId: args.userId,
      role,
      seatLimit: args.seatLimit,
    });
    await invitations.setAcceptanceResult(ctx, {
      scope,
      invitationId: grant.invitationId,
      acceptedBy: args.userId,
      result: { membershipId: membership._id },
    });
    await ctx.runMutation(internal.teams.setActiveTeamByIdInternal, {
      userId: args.userId,
      teamId: team._id,
    });
    return {
      teamId: team._id,
      teamPublicId: team.teamPublicId,
      teamSlug: team.teamSlug,
      role: membership.role,
    };
  },
});

export const revokeInvite = mutation({
  args: { userId: v.string(), inviteId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const invitation = await invitations.getById(ctx, {
      scope,
      invitationId: args.inviteId,
    });
    await requireManager(ctx, args.userId, invitation.resourceRef);
    await invitations.revoke(ctx, {
      scope,
      invitationId: args.inviteId,
      reason: "host_revoked",
    });
    return { ok: true };
  },
});

export const resendInvite = mutation({
  args: { userId: v.string(), inviteId: v.string() },
  returns: v.object({
    inviteId: v.string(),
    token: v.string(),
    email: v.string(),
    role: roleValidator,
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const invitation = await invitations.getById(ctx, {
      scope,
      invitationId: args.inviteId,
    });
    await requireManager(ctx, args.userId, invitation.resourceRef);
    if (!invitation.audienceRef)
      throw new Error("Invitation has no recipient.");
    const issued = await invitations.resend(ctx, {
      scope,
      invitationId: args.inviteId,
    });
    return {
      inviteId: issued.invitationId,
      token: issued.token,
      expiresAt: issued.expiresAt,
      email: invitation.audienceRef,
      role: parseRole(invitation.role),
    };
  },
});

export const listPending = query({
  args: {
    userId: v.string(),
    teamSlug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.string(),
    page: v.array(
      v.object({
        inviteId: v.string(),
        email: v.string(),
        role: roleValidator,
        state: v.string(),
        deliveryState: v.string(),
        expiresAt: v.number(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) throw new Error("Team not found.");
    await requireManager(ctx, args.userId, team.teamPublicId);
    const result = await invitations.listByResource(ctx, {
      scope,
      resourceRef: team.teamPublicId,
      state: "pending",
      paginationOpts: boundedPagination(args.paginationOpts),
    });
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map((i) => ({
        inviteId: i._id,
        email: i.audienceRef ?? "",
        role: parseRole(i.role),
        state: i.state,
        deliveryState: i.deliveryState,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    };
  },
});

/** Trusted host delivery code records safe metadata, never a token or provider error. */
export const recordDeliveryAttempt = mutation({
  args: {
    inviteId: v.string(),
    state: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    transport: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await invitations.recordDeliveryAttempt(ctx, {
      scope,
      invitationId: args.inviteId,
      state: args.state,
      transport: args.transport,
      ...(args.state === "failed" ? { errorCode: "DELIVERY_FAILED" } : {}),
    });
    return null;
  },
});

/** Bounded maintenance for the trusted host scheduler. */
export const prune = mutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ expired: v.number(), deleted: v.number() }),
  handler: async (ctx, args) => invitations.prune(ctx, args),
});
