import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { grantMembership } from "./lib/membership.js";
import { getLiveTeamBySlug } from "./lib/teams.js";

function requiredText(value: string, label: string, max: number) {
  if (!value.trim() || value !== value.trim() || value.length > max)
    throw new Error(`Invalid import ${label}.`);
}

/** Trusted migration only. The host freezes writes and delays consumer cutover. */
export const begin = mutation({
  args: {
    teamPublicId: v.string(),
    teamName: v.string(),
    teamSlug: v.string(),
    ownerUserId: v.string(),
    personal: v.boolean(),
    expectedMemberCount: v.number(),
  },
  returns: v.object({
    teamId: v.id("teams"),
    status: v.union(v.literal("open"), v.literal("complete")),
  }),
  handler: async (ctx, args) => {
    requiredText(args.teamPublicId, "public ID", 256);
    requiredText(args.teamName, "name", 256);
    requiredText(args.ownerUserId, "owner", 256);
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.teamSlug) ||
      args.teamSlug.length > 128
    )
      throw new Error("Invalid import slug.");
    if (
      !Number.isSafeInteger(args.expectedMemberCount) ||
      args.expectedMemberCount < 1
    )
      throw new Error("Invalid import member count.");
    const receipt = await ctx.db
      .query("teamImports")
      .withIndex("by_teamPublicId", (q) =>
        q.eq("teamPublicId", args.teamPublicId),
      )
      .unique();
    if (receipt) {
      if (
        receipt.teamName !== args.teamName ||
        receipt.teamSlug !== args.teamSlug ||
        receipt.ownerUserId !== args.ownerUserId ||
        receipt.personal !== args.personal ||
        receipt.expectedMemberCount !== args.expectedMemberCount
      )
        throw new Error("Import snapshot conflicts with its receipt.");
      const team = await ctx.db.get(receipt.teamId);
      if (!team || team.status === "deleted")
        throw new Error("Imported team was deleted.");
      return { teamId: receipt.teamId, status: receipt.status };
    }
    const existing = await ctx.db
      .query("teams")
      .withIndex("by_teamPublicId", (q) =>
        q.eq("teamPublicId", args.teamPublicId),
      )
      .first();
    if (existing || (await getLiveTeamBySlug(ctx, args.teamSlug)))
      throw new Error("Import identifier conflicts with an existing team.");
    if (args.personal) {
      const personal = await ctx.db
        .query("teams")
        .withIndex("by_personalOwnerUserId", (q) =>
          q.eq("personalOwnerUserId", args.ownerUserId),
        )
        .first();
      if (personal) throw new Error("Personal workspace already exists.");
    }
    const now = Date.now();
    const teamId = await ctx.db.insert("teams", {
      teamPublicId: args.teamPublicId,
      teamName: args.teamName,
      teamSlug: args.teamSlug,
      ownerUserId: args.ownerUserId,
      personalOwnerUserId: args.personal ? args.ownerUserId : undefined,
      membershipCount: { kind: "ready", value: 1 },
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("teamMemberships", {
      teamId,
      userId: args.ownerUserId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("teamImports", { ...args, teamId, status: "open" });
    return { teamId, status: "open" as const };
  },
});

/** Repeat batches only while open. Role conflicts fail the whole batch. */
export const members = mutation({
  args: {
    teamPublicId: v.string(),
    members: v.array(
      v.object({
        userId: v.string(),
        role: v.union(
          v.literal("owner"),
          v.literal("admin"),
          v.literal("member"),
        ),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.members.length < 1 || args.members.length > 100)
      throw new Error("Import batches must contain 1 to 100 memberships.");
    const receipt = await ctx.db
      .query("teamImports")
      .withIndex("by_teamPublicId", (q) =>
        q.eq("teamPublicId", args.teamPublicId),
      )
      .unique();
    if (!receipt || receipt.status !== "open")
      throw new Error("Import is not open.");
    const team = await ctx.db.get(receipt.teamId);
    if (
      !team ||
      team.status !== "active" ||
      team.ownerUserId !== receipt.ownerUserId
    )
      throw new Error("Imported team changed or was deleted.");
    const seen = new Set<string>();
    for (const member of args.members) {
      requiredText(member.userId, "member", 256);
      if (seen.has(member.userId))
        throw new Error("Duplicate member in import batch.");
      seen.add(member.userId);
      if ((member.role === "owner") !== (member.userId === receipt.ownerUserId))
        throw new Error("Import owner conflicts with team owner.");
      const existing = await ctx.db
        .query("teamMemberships")
        .withIndex("by_teamId_userId", (q) =>
          q.eq("teamId", receipt.teamId).eq("userId", member.userId),
        )
        .unique();
      if (existing) {
        if (existing.role !== member.role)
          throw new Error("Import membership role conflicts.");
        continue;
      }
      if (member.role === "owner")
        throw new Error("Imported owner membership is missing.");
      await grantMembership(ctx, {
        teamId: receipt.teamId,
        userId: member.userId,
        role: member.role,
        seatLimit: receipt.expectedMemberCount,
      });
    }
    return null;
  },
});

/** Close before cutover. Closed receipts never replay membership writes. */
export const finish = mutation({
  args: { teamPublicId: v.string() },
  returns: v.id("teams"),
  handler: async (ctx, args) => {
    const receipt = await ctx.db
      .query("teamImports")
      .withIndex("by_teamPublicId", (q) =>
        q.eq("teamPublicId", args.teamPublicId),
      )
      .unique();
    if (!receipt) throw new Error("Import not found.");
    const team = await ctx.db.get(receipt.teamId);
    if (!team || team.status === "deleted")
      throw new Error("Imported team was deleted.");
    if (receipt.status === "complete") return receipt.teamId;
    const owner = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", receipt.teamId).eq("userId", receipt.ownerUserId),
      )
      .unique();
    if (team.ownerUserId !== receipt.ownerUserId || owner?.role !== "owner")
      throw new Error("Imported ownership changed.");
    if (
      team.membershipCount?.kind !== "ready" ||
      team.membershipCount.value !== receipt.expectedMemberCount
    )
      throw new Error("Import membership count does not match snapshot.");
    await ctx.db.patch(receipt._id, { status: "complete" });
    return receipt.teamId;
  },
});
