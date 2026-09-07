import { v } from "convex/values";
import { TeamsClient } from "convex-teams";
import { components, internal } from "./_generated/api.js";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";

const teams = new TeamsClient(components.teams);

/** Synthetic source data only. No connection to either consumer deployment. */
export const setup = internalMutation({
  args: {},
  returns: v.array(v.id("migrationSources")),
  handler: async (ctx) => {
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const suffix = crypto.randomUUID();
      const teamPublicId = `feedtwin-${suffix}`;
      const sourceId = await ctx.db.insert("migrationSources", {
        teamPublicId,
        teamSlug: `migration-${suffix}`,
        ownerUserId: `owner-${i}`,
        members: [
          { userId: `owner-${i}`, role: "owner" },
          { userId: `member-${i}`, role: "member" },
        ],
      });
      await ctx.db.insert("migrationProjects", {
        sourceTeamId: sourceId,
        creatorUserId: `creator-${i}`,
        projectOnlyUserId: `guest-${i}`,
        billingPublicId: teamPublicId,
      });
      ids.push(sourceId);
    }
    return ids;
  },
});

/** A small fixture fits one transaction. Real imports use separate bounded batches. */
export const migrate = internalMutation({
  args: { sourceId: v.id("migrationSources") },
  returns: v.string(),
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source) throw new Error("Missing migration source.");
    const result = await teams.importTeam(ctx, {
      teamPublicId: source.teamPublicId,
      teamName: "Migration fixture",
      teamSlug: source.teamSlug,
      ownerUserId: source.ownerUserId,
      personal: false,
      expectedMemberCount: source.members.length,
    });
    if (result.status === "open") {
      await teams.importMembers(ctx, {
        teamPublicId: source.teamPublicId,
        members: source.members,
      });
      await teams.finishImport(ctx, source.teamPublicId);
    }
    const mapping = await ctx.db
      .query("migrationMappings")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    if (mapping) {
      if (
        mapping.componentTeamId !== result.teamId ||
        mapping.teamPublicId !== source.teamPublicId
      )
        throw new Error("Conflicting migration mapping.");
    } else {
      await ctx.db.insert("migrationMappings", {
        sourceId,
        componentTeamId: result.teamId,
        teamPublicId: source.teamPublicId,
      });
    }
    return result.teamId;
  },
});

export const verify = internalQuery({
  args: { sourceId: v.id("migrationSources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    const mapping = await ctx.db
      .query("migrationMappings")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    const project = await ctx.db
      .query("migrationProjects")
      .withIndex("by_sourceTeamId", (q) => q.eq("sourceTeamId", sourceId))
      .unique();
    if (!source || !mapping || !project)
      throw new Error("Missing fixture records.");
    if (
      project.billingPublicId !== mapping.teamPublicId ||
      source.teamPublicId !== mapping.teamPublicId
    )
      throw new Error("Billing reference changed.");
    const members = await teams.listMembers(
      ctx,
      source.ownerUserId,
      source.teamSlug,
      { numItems: 100, cursor: null },
    );
    if (!members || members.page.length !== source.members.length)
      throw new Error("Membership count changed.");
    for (const subject of [
      ...source.members.map((member) => member.userId),
      project.projectOnlyUserId,
      "outsider",
    ]) {
      const oldMember = source.members.find(
        (member) => member.userId === subject,
      );
      const newMember = await teams.getTeamBySlug(
        ctx,
        subject,
        source.teamSlug,
      );
      if ((newMember?.role ?? null) !== (oldMember?.role ?? null))
        throw new Error("Team role changed.");
      if (newMember && newMember.teamId !== mapping.componentTeamId)
        throw new Error("Team mapping changed.");
      // Feedtwin permits project-only read access without team membership.
      const before =
        Boolean(oldMember) || subject === project.projectOnlyUserId;
      const after = Boolean(newMember) || subject === project.projectOnlyUserId;
      if (before !== after) throw new Error("Project access changed.");
    }
    // Source records remain intact for recovery before any post-cutover writes.
    if (!project.creatorUserId.startsWith("creator-"))
      throw new Error("Content owner changed.");
    return null;
  },
});

export const run = internalAction({
  args: {},
  returns: v.object({
    teams: v.number(),
    repeatable: v.boolean(),
    accessPreserved: v.boolean(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    teams: number;
    repeatable: boolean;
    accessPreserved: boolean;
  }> => {
    const sources = await ctx.runMutation(internal.migrationProof.setup, {});
    for (const sourceId of sources) {
      const first = await ctx.runMutation(internal.migrationProof.migrate, {
        sourceId,
      });
      const second = await ctx.runMutation(internal.migrationProof.migrate, {
        sourceId,
      });
      if (first !== second) throw new Error("Import retry changed team ID.");
      await ctx.runQuery(internal.migrationProof.verify, { sourceId });
    }
    return { teams: sources.length, repeatable: true, accessPreserved: true };
  },
});
