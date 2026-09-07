/**
 * Core team management: creation, membership, role management, preferences.
 *
 * All public functions receive `userId` explicitly — components cannot call
 * `ctx.auth`. Authenticate in your app layer, then pass the user's ID here.
 */

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { paginator } from "convex-helpers/server/pagination";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server.js";
import { grantMembership } from "./lib/membership.js";
import { boundedPagination, FALLBACK_PAGE_SIZE } from "./lib/pagination.js";
import { slugify } from "./lib/slugify.js";
import { getLiveTeamBySlug } from "./lib/teams.js";
import schema from "./schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeamRole = "owner" | "admin" | "member";

type Permission = "read" | "write" | "manage" | "members";

type DbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

type IdentityProfile = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
};

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given team role grants the requested permission.
 *
 * - owner / admin: all permissions
 * - member: read and write only
 */
export function roleAllowsPermission(
  role: TeamRole,
  permission: Permission,
): boolean {
  if (role === "owner" || role === "admin") return true;
  return permission === "read" || permission === "write";
}

function rolePermissions(role: TeamRole | null) {
  if (!role) {
    return {
      canRead: false,
      canWrite: false,
      canManage: false,
      canManageMembers: false,
    };
  }
  return {
    canRead: roleAllowsPermission(role, "read"),
    canWrite: roleAllowsPermission(role, "write"),
    canManage: roleAllowsPermission(role, "manage"),
    canManageMembers: roleAllowsPermission(role, "members"),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function randomTeamPublicId() {
  return `team_${crypto.randomUUID().replaceAll("-", "")}`;
}

function buildPersonalTeamName(profile?: IdentityProfile): string {
  const displayName = getDisplayName(profile);
  const localPart = getEmailLocalPart(profile?.email);
  const label = displayName ?? localPart;
  if (!label) return "Personal";
  return `${label} Personal`;
}

function getDisplayName(profile?: IdentityProfile): string | null {
  if (!profile) return null;
  if (profile.name?.trim()) return profile.name.trim();
  const first = profile.firstName?.trim() ?? "";
  const last = profile.lastName?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (profile.username?.trim()) return profile.username.trim();
  return null;
}

function getEmailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  const local = at > 0 ? normalized.slice(0, at) : normalized;
  return local.trim() || null;
}

async function resolveUniqueSlug(ctx: DbCtx, raw: string): Promise<string> {
  const base = slugify(raw) || "team";
  let slug = base;
  let suffix = 2;
  while (await getLiveTeamBySlug(ctx, slug)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

async function resolveUniquePersonalSlug(
  ctx: DbCtx,
  profile?: IdentityProfile,
): Promise<string> {
  const displayName = getDisplayName(profile);
  const localPart = getEmailLocalPart(profile?.email);
  const base = slugify(displayName ?? localPart ?? "user") || "user";
  let slug = `${base}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`;
  while (await getLiveTeamBySlug(ctx, slug)) {
    slug = `${base}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`;
  }
  return slug;
}

async function getOrCreateUserPreferences(
  ctx: MutationCtx,
  userId: string,
): Promise<Doc<"userTeamPreferences">> {
  const existing = await ctx.db
    .query("userTeamPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (existing) return existing;

  const now = Date.now();
  const id = await ctx.db.insert("userTeamPreferences", {
    userId,
    createdAt: now,
    updatedAt: now,
  });
  const preferences = await ctx.db.get(id);
  if (!preferences) throw new Error("Preference creation failed.");
  return preferences;
}

async function getUserPreferences(
  ctx: DbCtx,
  userId: string,
): Promise<Doc<"userTeamPreferences"> | null> {
  return ctx.db
    .query("userTeamPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

type TeamAccess = {
  teamId: Id<"teams">;
  role: TeamRole | null;
};

async function accessibleMembership(
  ctx: DbCtx,
  userId: string,
  teamId: Id<"teams"> | undefined,
) {
  if (!teamId) return null;
  const [team, member] = await Promise.all([
    ctx.db.get(teamId),
    ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .unique(),
  ]);
  return team && team.status !== "deleted" && member ? member : null;
}

async function resolveDefaultAndActive(
  ctx: DbCtx,
  userId: string,
  cursor: string | null = null,
): Promise<{
  defaultTeamId: Id<"teams"> | null;
  activeTeamId: Id<"teams"> | null;
  access: TeamAccess[];
  continuationCursor: string | null;
}> {
  const preferences = await getUserPreferences(ctx, userId);
  const [active, home] = await Promise.all([
    accessibleMembership(ctx, userId, preferences?.activeTeamId),
    accessibleMembership(ctx, userId, preferences?.defaultTeamId),
  ]);
  const selected = active ?? home;
  if (selected)
    return {
      defaultTeamId: home?.teamId ?? selected.teamId,
      activeTeamId: selected.teamId,
      access: [{ teamId: selected.teamId, role: selected.role }],
      continuationCursor: null,
    };
  const result = await paginator(ctx.db, schema)
    .query("teamMemberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .paginate({
      numItems: FALLBACK_PAGE_SIZE,
      cursor,
      maximumRowsRead: FALLBACK_PAGE_SIZE,
    });
  for (const member of result.page) {
    const team = await ctx.db.get(member.teamId);
    if (team && team.status !== "deleted")
      return {
        defaultTeamId: team._id,
        activeTeamId: team._id,
        access: [{ teamId: team._id, role: member.role }],
        continuationCursor: null,
      };
  }
  return {
    defaultTeamId: null,
    activeTeamId: null,
    access: [],
    continuationCursor: result.isDone ? null : result.continueCursor,
  };
}

// ---------------------------------------------------------------------------
// Internal bootstrapping
// ---------------------------------------------------------------------------

/**
 * Ensures the user has a personal team. Creates one if none exists.
 * Safe to call on every login — idempotent.
 */
async function ensurePersonalTeamForUser(
  ctx: MutationCtx,
  userId: string,
  profile?: IdentityProfile,
): Promise<{ defaultTeamId: Id<"teams">; activeTeamId: Id<"teams"> }> {
  const preferences = await getOrCreateUserPreferences(ctx, userId);
  const personal = await ctx.db
    .query("teams")
    .withIndex("by_personalOwnerUserId_status", (q) =>
      q.eq("personalOwnerUserId", userId).eq("status", "active"),
    )
    .first();
  if (personal)
    return {
      defaultTeamId: personal._id,
      activeTeamId: personal._id,
    };

  // No owned team found — create one.
  const now = Date.now();
  const teamName = buildPersonalTeamName(profile);
  const teamSlug = await resolveUniquePersonalSlug(ctx, profile);
  const teamPublicId = randomTeamPublicId();

  const teamId = await ctx.db.insert("teams", {
    teamName,
    teamSlug,
    teamPublicId,
    ownerUserId: userId,
    personalOwnerUserId: userId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("teamMemberships", {
    teamId,
    userId,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(preferences._id, {
    defaultTeamId: teamId,
    activeTeamId: preferences.activeTeamId ?? teamId,
    updatedAt: now,
  });

  return { defaultTeamId: teamId, activeTeamId: teamId };
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/**
 * Returns a bounded membership-order page of live teams.
 * A page can be empty while deletion cleanup is in progress.
 */
export const listForUser = query({
  args: { userId: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        teamId: v.string(),
        teamPublicId: v.string(),
        name: v.string(),
        slug: v.string(),
        status: v.union(
          v.literal("active"),
          v.literal("pending_payment"),
          v.literal("deleted"),
        ),
        role: v.union(
          v.literal("owner"),
          v.literal("admin"),
          v.literal("member"),
        ),
        access: v.object({
          canRead: v.boolean(),
          canWrite: v.boolean(),
          canManage: v.boolean(),
          canManageMembers: v.boolean(),
        }),
        isDefaultTeam: v.boolean(),
        isActiveTeam: v.boolean(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const options = boundedPagination(args.paginationOpts);
    const preferences = await getUserPreferences(ctx, args.userId);
    const result = await paginator(ctx.db, schema)
      .query("teamMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .paginate(options);
    const page = [];
    for (const member of result.page) {
      const team = await ctx.db.get(member.teamId);
      if (!team || team.status === "deleted") continue;
      page.push({
        teamId: team._id,
        teamPublicId: team.teamPublicId,
        name: team.teamName,
        slug: team.teamSlug,
        status: team.status,
        role: member.role,
        access: rolePermissions(member.role),
        isDefaultTeam: preferences?.defaultTeamId === team._id,
        isActiveTeam: preferences?.activeTeamId === team._id,
      });
    }
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Returns a single team by slug if the user has access, null otherwise.
 */
export const getBySlug = query({
  args: { userId: v.string(), teamSlug: v.string() },
  returns: v.union(
    v.object({
      teamId: v.string(),
      teamPublicId: v.string(),
      name: v.string(),
      slug: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("pending_payment"),
        v.literal("deleted"),
      ),
      role: v.union(
        v.literal("owner"),
        v.literal("admin"),
        v.literal("member"),
      ),
      access: v.object({
        canRead: v.boolean(),
        canWrite: v.boolean(),
        canManage: v.boolean(),
        canManageMembers: v.boolean(),
      }),
      isDefaultTeam: v.boolean(),
      isActiveTeam: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) return null;

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();
    if (!membership) return null;

    const preferences = await getUserPreferences(ctx, args.userId);
    return {
      teamId: team._id,
      teamPublicId: team.teamPublicId,
      name: team.teamName,
      slug: team.teamSlug,
      status: team.status,
      role: membership.role,
      access: rolePermissions(membership.role),
      isDefaultTeam: preferences?.defaultTeamId === team._id,
      isActiveTeam: preferences?.activeTeamId === team._id,
    };
  },
});

/**
 * Returns the user's active team (last switched to), or null.
 */
export const getActiveTeam = query({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      teamId: v.string(),
      teamPublicId: v.string(),
      slug: v.string(),
      name: v.string(),
      role: v.union(
        v.literal("owner"),
        v.literal("admin"),
        v.literal("member"),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const resolved = await resolveDefaultAndActive(ctx, args.userId);
    if (!resolved.activeTeamId) return null;

    const team = await ctx.db.get(resolved.activeTeamId);
    if (!team || team.status === "deleted") return null;

    const accessEntry = resolved.access.find((a) => a.teamId === team._id);
    if (!accessEntry?.role) return null;

    return {
      teamId: team._id,
      teamPublicId: team.teamPublicId,
      slug: team.teamSlug,
      name: team.teamName,
      role: accessEntry.role,
    };
  },
});

/**
 * Returns the user's default team, or null.
 */
export const getDefaultTeam = query({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      teamId: v.string(),
      teamPublicId: v.string(),
      slug: v.string(),
      name: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const preferences = await getUserPreferences(ctx, args.userId);
    if (!preferences?.defaultTeamId) return null;

    const team = await ctx.db.get(preferences.defaultTeamId);
    if (!team || team.status === "deleted") return null;

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();
    if (!membership) return null;

    return {
      teamId: team._id,
      teamPublicId: team.teamPublicId,
      slug: team.teamSlug,
      name: team.teamName,
    };
  },
});

/**
 * Returns one page of members for a team.
 * The calling user must be a member of the team.
 */
export const listMembers = query({
  args: {
    userId: v.string(),
    teamSlug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.union(
    v.null(),
    v.object({
      isDone: v.boolean(),
      continueCursor: v.string(),
      page: v.array(
        v.object({
          membershipId: v.string(),
          userId: v.string(),
          role: v.union(
            v.literal("owner"),
            v.literal("admin"),
            v.literal("member"),
          ),
          createdAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) return null;
    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .unique();
    if (!membership) return null;
    const result = await paginator(ctx.db, schema)
      .query("teamMemberships")
      .withIndex("by_teamId", (q) => q.eq("teamId", team._id))
      .paginate(boundedPagination(args.paginationOpts));
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map((m) => ({
        membershipId: m._id,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------

/**
 * Bootstraps a personal team for a user if one doesn't exist.
 * Call this after a user signs up or logs in for the first time.
 * Safe to call repeatedly — idempotent.
 */
export const ensurePersonalTeam = mutation({
  args: {
    userId: v.string(),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.object({
    defaultTeamId: v.string(),
    defaultTeamPublicId: v.string(),
    defaultTeamSlug: v.string(),
    activeTeamId: v.string(),
    activeTeamPublicId: v.string(),
    activeTeamSlug: v.string(),
  }),
  handler: async (ctx, args) => {
    const profile: IdentityProfile = {
      name: args.name,
      firstName: args.firstName,
      lastName: args.lastName,
      username: args.username,
      email: args.email,
    };

    const ensured = await ensurePersonalTeamForUser(ctx, args.userId, profile);
    const resolved = await resolveDefaultAndActive(ctx, args.userId);

    const defaultTeamId = resolved.defaultTeamId ?? ensured.defaultTeamId;
    const activeTeamId = resolved.activeTeamId ?? ensured.activeTeamId;

    const [defaultTeam, activeTeam] = await Promise.all([
      ctx.db.get(defaultTeamId),
      ctx.db.get(activeTeamId),
    ]);

    const safeDefault = defaultTeam ?? activeTeam;
    const safeActive = activeTeam ?? defaultTeam;
    if (!safeDefault || !safeActive) {
      throw new Error("Could not resolve default and active team.");
    }

    const prefs = await getOrCreateUserPreferences(ctx, args.userId);
    await ctx.db.patch(prefs._id, {
      defaultTeamId: safeDefault._id,
      activeTeamId: safeActive._id,
      updatedAt: Date.now(),
    });

    return {
      defaultTeamId: safeDefault._id,
      defaultTeamPublicId: safeDefault.teamPublicId,
      defaultTeamSlug: safeDefault.teamSlug,
      activeTeamId: safeActive._id,
      activeTeamPublicId: safeActive.teamPublicId,
      activeTeamSlug: safeActive.teamSlug,
    };
  },
});

/**
 * Creates a new team owned by the given user.
 * The slug is derived from the team name and made unique automatically.
 */
export const createTeam = mutation({
  args: {
    userId: v.string(),
    teamName: v.string(),
  },
  returns: v.object({
    teamId: v.string(),
    teamPublicId: v.string(),
    teamSlug: v.string(),
    teamName: v.string(),
  }),
  handler: async (ctx, args) => {
    const name = args.teamName.trim();
    if (!name) throw new Error("Team name is required.");

    const now = Date.now();
    const teamSlug = await resolveUniqueSlug(ctx, name);
    const teamPublicId = randomTeamPublicId();

    const teamId = await ctx.db.insert("teams", {
      teamName: name,
      teamSlug,
      teamPublicId,
      ownerUserId: args.userId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("teamMemberships", {
      teamId,
      userId: args.userId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });

    const prefs = await getOrCreateUserPreferences(ctx, args.userId);
    await ctx.db.patch(prefs._id, {
      defaultTeamId: prefs.defaultTeamId ?? teamId,
      activeTeamId: teamId,
      updatedAt: now,
    });

    return { teamId: teamId, teamPublicId, teamSlug, teamName: name };
  },
});

/**
 * Sets the user's active team by slug. Validates that the user is a member.
 */
export const setActiveTeam = mutation({
  args: { userId: v.string(), teamSlug: v.string() },
  returns: v.object({
    teamId: v.string(),
    teamPublicId: v.string(),
    slug: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  }),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) throw new Error("Team not found.");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();
    if (!membership) throw new Error("Not authorized.");

    const prefs = await getOrCreateUserPreferences(ctx, args.userId);
    await ctx.db.patch(prefs._id, {
      activeTeamId: team._id,
      defaultTeamId: prefs.defaultTeamId ?? team._id,
      updatedAt: Date.now(),
    });

    return {
      teamId: team._id,
      teamPublicId: team.teamPublicId,
      slug: team.teamSlug,
      role: membership.role,
    };
  },
});

/**
 * Sets the user's default (home) team.
 */
export const setDefaultTeam = mutation({
  args: { userId: v.string(), teamId: v.id("teams") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.status === "deleted") throw new Error("Team not found.");
    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId),
      )
      .first();
    if (!membership) throw new Error("Not authorized.");

    const prefs = await getOrCreateUserPreferences(ctx, args.userId);
    await ctx.db.patch(prefs._id, {
      defaultTeamId: args.teamId,
      activeTeamId: prefs.activeTeamId ?? args.teamId,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

/**
 * Updates a team's display name and/or URL slug.
 * Requires admin or owner role. The host controls profile update throttling.
 */
export const updateTeamProfile = mutation({
  args: {
    userId: v.string(),
    teamSlug: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
  },
  returns: v.object({
    updated: v.boolean(),
    name: v.string(),
    slug: v.string(),
    teamPublicId: v.string(),
  }),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) throw new Error("Team not found.");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();
    if (!membership || !roleAllowsPermission(membership.role, "manage")) {
      throw new Error("Not authorized.");
    }

    const now = Date.now();
    const newName = args.name.trim();
    if (!newName) throw new Error("Team name is required.");

    const targetSlug = args.slug?.trim() || newName;
    const newSlug = slugify(targetSlug);
    if (!newSlug) throw new Error("Invalid team slug.");

    const conflicting = await getLiveTeamBySlug(ctx, newSlug);
    if (conflicting && conflicting._id !== team._id) {
      throw new Error("Team URL is already taken.");
    }

    const unchanged = newName === team.teamName && newSlug === team.teamSlug;
    if (unchanged) {
      return {
        updated: false,
        name: team.teamName,
        slug: team.teamSlug,
        teamPublicId: team.teamPublicId,
      };
    }

    await ctx.db.patch(team._id, {
      teamName: newName,
      teamSlug: newSlug,
      profileUpdatedAt: now,
      updatedAt: now,
    });

    return {
      updated: true,
      name: newName,
      slug: newSlug,
      teamPublicId: team.teamPublicId,
    };
  },
});

/**
 * Removes a member from a team. Also removes any scoped project memberships
 * the user had within the team (if your app extends this component with
 * project-level access, cascade the cleanup from your app layer).
 * Cannot remove the owner.
 */
export const removeMember = mutation({
  args: {
    userId: v.string(),
    teamSlug: v.string(),
    targetUserId: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) throw new Error("Team not found.");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();
    if (!membership || !roleAllowsPermission(membership.role, "members")) {
      throw new Error("Not authorized.");
    }
    if (args.targetUserId === args.userId) {
      throw new Error("Cannot remove yourself. Use leaveTeam instead.");
    }

    const target = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.targetUserId),
      )
      .first();
    if (!target) throw new Error("Member not found.");
    if (target.role === "owner")
      throw new Error("Cannot remove the team owner.");

    await ctx.db.delete(target._id);
    await repairPreferences(ctx, args.targetUserId);
    return { ok: true };
  },
});

/**
 * Changes a team member's role. Cannot change the owner's role.
 */
export const updateMemberRole = mutation({
  args: {
    userId: v.string(),
    teamSlug: v.string(),
    targetUserId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  returns: v.object({
    ok: v.boolean(),
    updated: v.boolean(),
    role: v.string(),
  }),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) throw new Error("Team not found.");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();
    if (!membership || !roleAllowsPermission(membership.role, "members")) {
      throw new Error("Not authorized.");
    }
    if (args.targetUserId === args.userId) {
      throw new Error("Cannot change your own role.");
    }

    const target = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.targetUserId),
      )
      .first();
    if (!target) throw new Error("Member not found.");
    if (target.role === "owner")
      throw new Error("Cannot change the owner's role.");
    if (target.role === args.role) {
      return { ok: true, updated: false, role: target.role };
    }

    await ctx.db.patch(target._id, { role: args.role, updatedAt: Date.now() });
    return { ok: true, updated: true, role: args.role };
  },
});

/**
 * Removes a non-owner membership and resolves a valid fallback, or no workspace.
 */
export const leaveTeam = mutation({
  args: { userId: v.string(), teamSlug: v.string() },
  returns: v.object({
    ok: v.boolean(),
    leftTeamPublicId: v.string(),
    redirectTeamPublicId: v.union(v.string(), v.null()),
    redirectTeamSlug: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team) throw new Error("Team not found.");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();
    if (!membership) throw new Error("Not authorized.");
    if (membership.role === "owner")
      throw new Error("Team owner cannot leave.");

    await ctx.db.delete(membership._id);
    const redirectTeam = await repairPreferences(ctx, args.userId);

    return {
      ok: true,
      leftTeamPublicId: team.teamPublicId,
      redirectTeamPublicId: redirectTeam?.teamPublicId ?? null,
      redirectTeamSlug: redirectTeam?.teamSlug ?? null,
    };
  },
});

/**
 * Denies team access immediately and removes memberships in bounded batches.
 * Requires the owner. The host coordinates content and subscription cleanup.
 */
export const deleteTeam = mutation({
  args: { userId: v.string(), teamPublicId: v.string() },
  returns: v.object({
    ok: v.boolean(),
    redirectTeamPublicId: v.union(v.string(), v.null()),
    redirectTeamSlug: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_teamPublicId", (q) =>
        q.eq("teamPublicId", args.teamPublicId),
      )
      .first();
    if (!team || team.status === "deleted") throw new Error("Team not found.");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();
    if (
      !membership ||
      membership.role !== "owner" ||
      team.ownerUserId !== args.userId
    ) {
      throw new Error("Not authorized.");
    }

    const now = Date.now();
    await ctx.db.patch(team._id, {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });
    const defaultTeam = await repairPreferences(ctx, args.userId);
    await cleanupDeletedTeam(ctx, team._id);

    return {
      ok: true,
      redirectTeamPublicId: defaultTeam?.teamPublicId ?? null,
      redirectTeamSlug: defaultTeam?.teamSlug ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal functions (for use within the component or from the app layer)
// ---------------------------------------------------------------------------

/**
 * Resolves the active team for a user. Used internally by actions that
 * can't run queries directly.
 */
export const resolveActiveTeamInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveDefaultAndActive(ctx, args.userId);
    if (!resolved.activeTeamId) return null;

    const team = await ctx.db.get(resolved.activeTeamId);
    if (!team || team.status === "deleted") return null;

    const accessEntry = resolved.access.find((a) => a.teamId === team._id);
    return {
      teamId: team._id,
      teamPublicId: team.teamPublicId,
      teamSlug: team.teamSlug,
      teamRole: accessEntry?.role ?? null,
    };
  },
});

/**
 * Sets the active team by ID. Used internally (e.g., after accepting an invite).
 */
export const setActiveTeamByIdInternal = internalMutation({
  args: { userId: v.string(), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    const member = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId),
      )
      .unique();
    if (!team || team.status === "deleted" || !member)
      throw new Error("Not authorized.");
    const prefs = await getOrCreateUserPreferences(ctx, args.userId);
    await ctx.db.patch(prefs._id, {
      activeTeamId: args.teamId,
      defaultTeamId: prefs.defaultTeamId ?? args.teamId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Ensures a personal team exists when explicitly requested by the host.
 */
export const ensurePersonalTeamInternal = internalMutation({
  args: {
    userId: v.string(),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ensurePersonalTeamForUser(ctx, args.userId, {
      name: args.name,
      firstName: args.firstName,
      lastName: args.lastName,
      username: args.username,
      email: args.email,
    });
  },
});

/**
 * Inserts a team membership directly. Useful for programmatic provisioning,
 * webhooks, or testing without going through the invite flow.
 */
export const addMemberInternal = mutation({
  args: {
    teamId: v.id("teams"),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    seatLimit: v.optional(v.number()),
  },
  returns: v.object({ membershipId: v.string() }),
  handler: async (ctx, args) => {
    const membership = await grantMembership(ctx, args);
    return { membershipId: membership._id };
  },
});

/** Only the current owner can transfer ownership to an existing member. */
export const transferOwnership = mutation({
  args: { userId: v.string(), teamSlug: v.string(), targetUserId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const team = await getLiveTeamBySlug(ctx, args.teamSlug.trim());
    if (!team || team.ownerUserId !== args.userId)
      throw new Error("Not authorized.");
    if (team.personalOwnerUserId)
      throw new Error("Personal team ownership cannot be transferred.");
    const owner = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .unique();
    if (owner?.role !== "owner") throw new Error("Not authorized.");
    const target = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", team._id).eq("userId", args.targetUserId),
      )
      .unique();
    if (!target) throw new Error("Member not found.");
    if (target._id === owner._id) return { ok: true };
    const updatedAt = Date.now();
    await ctx.db.patch(owner._id, { role: "admin", updatedAt });
    await ctx.db.patch(target._id, { role: "owner", updatedAt });
    await ctx.db.patch(team._id, { ownerUserId: args.targetUserId, updatedAt });
    return { ok: true };
  },
});

async function repairPreferences(
  ctx: MutationCtx,
  userId: string,
  cursor: string | null = null,
) {
  const resolved = await resolveDefaultAndActive(ctx, userId, cursor);
  const preferences = await getUserPreferences(ctx, userId);
  if (preferences)
    await ctx.db.patch(preferences._id, {
      defaultTeamId: resolved.defaultTeamId ?? undefined,
      activeTeamId: resolved.activeTeamId ?? undefined,
      updatedAt: Date.now(),
    });
  if (resolved.continuationCursor !== null) {
    await ctx.scheduler.runAfter(0, internal.teams.repairPreferencesInternal, {
      userId,
      cursor: resolved.continuationCursor,
    });
  }
  return resolved.activeTeamId ? await ctx.db.get(resolved.activeTeamId) : null;
}

const CLEANUP_BATCH_SIZE = 50;
async function cleanupDeletedTeam(ctx: MutationCtx, teamId: Id<"teams">) {
  const team = await ctx.db.get(teamId);
  if (!team || team.status !== "deleted") return;
  const members = await ctx.db
    .query("teamMemberships")
    .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
    .take(CLEANUP_BATCH_SIZE);
  for (const member of members) {
    await ctx.db.delete(member._id);
    await repairPreferences(ctx, member.userId);
  }
  const defaults = await ctx.db
    .query("userTeamPreferences")
    .withIndex("by_defaultTeamId", (q) => q.eq("defaultTeamId", teamId))
    .take(CLEANUP_BATCH_SIZE);
  const active = await ctx.db
    .query("userTeamPreferences")
    .withIndex("by_activeTeamId", (q) => q.eq("activeTeamId", teamId))
    .take(CLEANUP_BATCH_SIZE);
  for (const pref of [...defaults, ...active])
    await repairPreferences(ctx, pref.userId);
  if (
    members.length === CLEANUP_BATCH_SIZE ||
    defaults.length === CLEANUP_BATCH_SIZE ||
    active.length === CLEANUP_BATCH_SIZE
  ) {
    await ctx.scheduler.runAfter(0, internal.teams.cleanupDeletedTeamInternal, {
      teamId,
    });
  } else {
    await ctx.db.delete(teamId);
  }
}

export const cleanupDeletedTeamInternal = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => cleanupDeletedTeam(ctx, args.teamId),
});

/** Recheck preferences before each continuation so a user's later selection wins. */
export const repairPreferencesInternal = internalMutation({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await repairPreferences(ctx, args.userId, args.cursor);
    return null;
  },
});
