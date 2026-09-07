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
    const runId = crypto.randomUUID();
    for (let i = 0; i < 2; i++) {
      const suffix = crypto.randomUUID();
      const teamPublicId = `feedtwin-${suffix}`;
      const sourceId = await ctx.db.insert("migrationSources", {
        teamPublicId,
        teamSlug: `migration-${suffix}`,
        ownerUserId: `owner-${i}-${runId}`,
        members: [
          { userId: `owner-${i}-${runId}`, role: "owner" },
          { userId: `member-${i}-${runId}`, role: "member" },
          { userId: `shared-${runId}`, role: "member" },
        ],
      });
      await ctx.db.insert("migrationProjects", {
        sourceTeamId: sourceId,
        creatorUserId: `creator-${i}`,
        projectOnlyUserId: `guest-${i}-${runId}`,
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

/** Translate one source preference transactionally. Project-only selections stay host-owned. */
export const migratePreferences = internalMutation({
  args: { preferenceId: v.id("migrationPreferences") },
  returns: v.null(),
  handler: async (ctx, { preferenceId }) => {
    const preference = await ctx.db.get(preferenceId);
    if (!preference) throw new Error("Missing source preference.");
    if (preference.applied) return null;
    for (const kind of ["default", "active"] as const) {
      const sourceId =
        kind === "default"
          ? preference.defaultSourceId
          : preference.activeSourceId;
      const source = await ctx.db.get(sourceId);
      const mapping = await ctx.db
        .query("migrationMappings")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
        .unique();
      if (!source || !mapping)
        throw new Error(
          "Preference migration requires completed team mappings.",
        );
      const member = await teams.getTeamBySlug(
        ctx,
        preference.userId,
        source.teamSlug,
      );
      if (!member) continue;
      if (member.teamId !== mapping.componentTeamId)
        throw new Error("Preference mapping mismatch.");
      if (kind === "default")
        await teams.setDefaultTeam(
          ctx,
          preference.userId,
          mapping.componentTeamId,
        );
      else await teams.setActiveTeam(ctx, preference.userId, source.teamSlug);
    }
    await ctx.db.patch(preferenceId, { applied: true });
    return null;
  },
});

export const setupPreferences = internalMutation({
  args: {
    firstId: v.id("migrationSources"),
    secondId: v.id("migrationSources"),
  },
  returns: v.object({
    memberPreferenceId: v.id("migrationPreferences"),
    guestPreferenceId: v.id("migrationPreferences"),
  }),
  handler: async (ctx, { firstId, secondId }) => {
    const first = await ctx.db.get(firstId);
    const second = await ctx.db.get(secondId);
    const project = await ctx.db
      .query("migrationProjects")
      .withIndex("by_sourceTeamId", (q) => q.eq("sourceTeamId", firstId))
      .unique();
    const shared = first?.members.find((member) =>
      second?.members.some((other) => other.userId === member.userId),
    );
    if (!shared || !project) throw new Error("Missing shared fixture member.");
    const memberPreferenceId = await ctx.db.insert("migrationPreferences", {
      userId: shared.userId,
      defaultSourceId: secondId,
      activeSourceId: firstId,
      applied: false,
    });
    const guestPreferenceId = await ctx.db.insert("migrationPreferences", {
      userId: project.projectOnlyUserId,
      defaultSourceId: firstId,
      activeSourceId: firstId,
      applied: false,
    });
    return { memberPreferenceId, guestPreferenceId };
  },
});

/** Exercise real component lifecycle operations against imported records. */
export const lifecycle = internalMutation({
  args: {
    memberPreferenceId: v.id("migrationPreferences"),
    guestPreferenceId: v.id("migrationPreferences"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const preference = await ctx.db.get(args.memberPreferenceId);
    const guest = await ctx.db.get(args.guestPreferenceId);
    if (!preference?.applied || !guest?.applied)
      throw new Error("Preferences must be migrated first.");
    const first = await ctx.db.get(preference.activeSourceId);
    const second = await ctx.db.get(preference.defaultSourceId);
    if (!first || !second) throw new Error("Missing source teams.");
    const active = await teams.getActiveTeam(ctx, preference.userId);
    const home = await teams.getDefaultTeam(ctx, preference.userId);
    if (
      active?.teamPublicId !== first.teamPublicId ||
      home?.teamPublicId !== second.teamPublicId
    )
      throw new Error("Source preferences were not preserved.");
    if (await teams.getActiveTeam(ctx, guest.userId))
      throw new Error("Project-only preference granted team access.");
    await teams.removeMember(ctx, {
      userId: first.ownerUserId,
      teamSlug: first.teamSlug,
      targetUserId: preference.userId,
    });
    if (
      (await teams.getActiveTeam(ctx, preference.userId))?.teamPublicId !==
      second.teamPublicId
    )
      throw new Error(
        "Removed member did not fall back to the remaining team.",
      );
    const email = `${crypto.randomUUID()}@example.com`;
    const recipient = crypto.randomUUID();
    const invite = await teams.createInvite(ctx, {
      userId: first.ownerUserId,
      teamSlug: first.teamSlug,
      email,
      role: "member",
    });
    await teams.acceptInvite(ctx, {
      userId: recipient,
      email,
      token: invite.token,
      seatLimit: 3,
    });
    await teams.acceptInvite(ctx, {
      userId: recipient,
      email,
      token: invite.token,
      seatLimit: 3,
    });
    await teams.transferOwnership(ctx, {
      userId: first.ownerUserId,
      teamSlug: first.teamSlug,
      targetUserId: recipient,
    });
    if (
      (await teams.getTeamBySlug(ctx, recipient, first.teamSlug))?.role !==
      "owner"
    )
      throw new Error("Ownership transfer failed.");
    await teams.deleteTeam(ctx, recipient, first.teamPublicId);
    if (await teams.getTeamBySlug(ctx, recipient, first.teamSlug))
      throw new Error("Deleted team still grants access.");
    // Keep host content and billing evidence for explicit cleanup and reconciliation.
    const project = await ctx.db
      .query("migrationProjects")
      .withIndex("by_sourceTeamId", (q) => q.eq("sourceTeamId", first._id))
      .unique();
    if (!project || project.billingPublicId !== first.teamPublicId)
      throw new Error("Host evidence was deleted.");
    return null;
  },
});

export const runLifecycle = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const sources = await ctx.runMutation(internal.migrationProof.setup, {});
    const [firstId, secondId] = sources;
    if (!firstId || !secondId) throw new Error("Missing fixture teams.");
    for (const sourceId of sources)
      await ctx.runMutation(internal.migrationProof.migrate, { sourceId });
    const preferences = await ctx.runMutation(
      internal.migrationProof.setupPreferences,
      { firstId, secondId },
    );
    for (const preferenceId of [
      preferences.memberPreferenceId,
      preferences.guestPreferenceId,
    ]) {
      await ctx.runMutation(internal.migrationProof.migratePreferences, {
        preferenceId,
      });
      await ctx.runMutation(internal.migrationProof.migratePreferences, {
        preferenceId,
      });
    }
    await ctx.runMutation(internal.migrationProof.lifecycle, preferences);
    // A stale preference replay cannot restore access or overwrite the fallback.
    await ctx.runMutation(internal.migrationProof.migratePreferences, {
      preferenceId: preferences.memberPreferenceId,
    });
    return null;
  },
});

/** Small-consumer recovery rehearsal. Freeze both writers before invoking it. */
export const reconcileSource = internalMutation({
  args: { sourceId: v.id("migrationSources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    const mapping = await ctx.db
      .query("migrationMappings")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    if (!source || !mapping || source.teamPublicId !== mapping.teamPublicId)
      throw new Error("Recovery requires a valid mapping.");
    const previous = await ctx.db
      .query("migrationRecovery")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    if (previous) return null;
    const state = await teams.getTeamState(ctx, mapping.teamPublicId);
    if (state && state.teamId !== mapping.componentTeamId)
      throw new Error("Recovery destination changed.");
    const page = state
      ? await teams.listMembers(ctx, state.ownerUserId, state.teamSlug, {
          numItems: 100,
          cursor: null,
        })
      : null;
    if (state && (!page || !page.isDone))
      throw new Error("Recovery fixture requires at most 100 members.");
    const members =
      page?.page.map((member) => ({
        userId: member.userId,
        role: member.role,
      })) ?? [];
    if (
      state &&
      (members.filter((member) => member.role === "owner").length !== 1 ||
        !members.some(
          (member) =>
            member.role === "owner" && member.userId === state.ownerUserId,
        ))
    )
      throw new Error("Recovery ownership mismatch.");
    if (state) {
      const pending = await teams.listPendingInvites(
        ctx,
        state.ownerUserId,
        state.teamSlug,
        { numItems: 100, cursor: null },
      );
      if (!pending.isDone)
        throw new Error(
          "Recovery fixture requires at most 100 pending invitations.",
        );
      for (const invite of pending.page)
        await teams.revokeInvite(ctx, state.ownerUserId, invite.inviteId);
    }
    await ctx.db.insert("migrationRecovery", {
      sourceId,
      previousMembers: source.members,
      previousOwnerUserId: source.ownerUserId,
      appliedAt: Date.now(),
    });
    await ctx.db.patch(sourceId, {
      members,
      ownerUserId: state?.ownerUserId ?? source.ownerUserId,
      teamSlug: state?.teamSlug ?? source.teamSlug,
      recoveredStatus: state ? "active" : "deleted",
    });
    return null;
  },
});

export const mutateRecoveryFixture = internalMutation({
  args: { sourceId: v.id("migrationSources"), deleted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { sourceId, deleted }) => {
    const source = await ctx.db.get(sourceId);
    const mapping = await ctx.db
      .query("migrationMappings")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    if (!source || !mapping) throw new Error("Missing recovery fixture.");
    if (deleted) {
      await teams.deleteTeam(ctx, source.ownerUserId, source.teamPublicId);
    } else {
      const successor = crypto.randomUUID();
      await teams.addMember(ctx, {
        teamId: mapping.componentTeamId,
        userId: successor,
        role: "member",
      });
      await teams.transferOwnership(ctx, {
        userId: source.ownerUserId,
        teamSlug: source.teamSlug,
        targetUserId: successor,
      });
      await teams.removeMember(ctx, {
        userId: successor,
        teamSlug: source.teamSlug,
        targetUserId: source.ownerUserId,
      });
      await teams.createInvite(ctx, {
        userId: successor,
        teamSlug: source.teamSlug,
        email: `${crypto.randomUUID()}@example.com`,
        role: "member",
      });
    }
    return null;
  },
});

export const verifyRecovery = internalQuery({
  args: { sourceId: v.id("migrationSources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    const receipt = await ctx.db
      .query("migrationRecovery")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    if (!source || !receipt) throw new Error("Recovery not applied.");
    const state = await teams.getTeamState(ctx, source.teamPublicId);
    if (!state) {
      if (source.recoveredStatus !== "deleted" || source.members.length)
        throw new Error("Recovery restored deleted access.");
      return null;
    }
    const page = await teams.listMembers(
      ctx,
      state.ownerUserId,
      state.teamSlug,
      { numItems: 100, cursor: null },
    );
    if (!page?.isDone) throw new Error("Incomplete recovery comparison.");
    const pending = await teams.listPendingInvites(
      ctx,
      state.ownerUserId,
      state.teamSlug,
      { numItems: 100, cursor: null },
    );
    if (pending.page.length)
      throw new Error("Recovery left an outstanding invitation.");
    const sorted = (members: Array<{ userId: string; role: string }>) =>
      members.map((member) => `${member.userId}:${member.role}`).sort();
    if (
      source.ownerUserId !== state.ownerUserId ||
      JSON.stringify(sorted(source.members)) !==
        JSON.stringify(sorted(page.page))
    )
      throw new Error("Recovered access differs from destination.");
    return null;
  },
});

export const runRecovery = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const sources = await ctx.runMutation(internal.migrationProof.setup, {});
    for (const [index, sourceId] of sources.entries()) {
      await ctx.runMutation(internal.migrationProof.migrate, { sourceId });
      await ctx.runMutation(internal.migrationProof.mutateRecoveryFixture, {
        sourceId,
        deleted: index === 1,
      });
      await ctx.runMutation(internal.migrationProof.reconcileSource, {
        sourceId,
      });
      await ctx.runMutation(internal.migrationProof.reconcileSource, {
        sourceId,
      });
      await ctx.runQuery(internal.migrationProof.verifyRecovery, { sourceId });
    }
    return null;
  },
});
