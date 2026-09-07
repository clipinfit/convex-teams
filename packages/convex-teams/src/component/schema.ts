import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * A team (organization). Teams have a human-readable name, a URL slug,
   * a stable public ID, and an owner. Status tracks payment/deletion state.
   */
  teams: defineTable({
    teamName: v.string(),
    teamSlug: v.string(),
    /** Stable opaque public ID — safe to expose in URLs and API responses */
    teamPublicId: v.string(),
    ownerUserId: v.string(),
    personalOwnerUserId: v.optional(v.string()),
    /** Missing on legacy records. Grants require a completed count migration. */
    membershipCount: v.optional(
      v.union(
        v.object({ kind: v.literal("ready"), value: v.number() }),
        v.object({
          kind: v.literal("counting"),
          cursor: v.union(v.string(), v.null()),
          total: v.number(),
        }),
      ),
    ),
    status: v.union(
      v.literal("active"),
      v.literal("pending_payment"),
      v.literal("deleted"),
    ),
    deletedAt: v.optional(v.number()),
    /** Timestamp of the last profile (name/slug) update */
    profileUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teamSlug", ["teamSlug"])
    .index("by_teamSlug_status", ["teamSlug", "status"])
    .index("by_teamPublicId", ["teamPublicId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_personalOwnerUserId", ["personalOwnerUserId"])
    .index("by_personalOwnerUserId_status", ["personalOwnerUserId", "status"]),

  /**
   * A user's membership in a team. Roles:
   *   owner  — created the team, cannot be removed, cannot change own role
   *   admin  — full management rights (members, settings)
   *   member — read/write access, no management
   */
  teamMemberships: defineTable({
    teamId: v.id("teams"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teamId", ["teamId"])
    .index("by_userId", ["userId"])
    .index("by_teamId_userId", ["teamId", "userId"]),

  /**
   * Legacy invitations retained for migration inspection only. No runtime uses these records.
   * An email-based invite to join a team. The invite token is hashed
   * (SHA-256) before storage — only the raw token is sent to the user.
   * Status flow: pending → accepted | revoked | expired | error
   */
  teamInvites: defineTable({
    teamId: v.id("teams"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    tokenHash: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("error"),
      v.literal("accepted"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    invitedByUserId: v.string(),
    acceptedByUserId: v.optional(v.string()),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teamId_status", ["teamId", "status"])
    .index("by_email_status", ["email", "status"])
    .index("by_tokenHash", ["tokenHash"]),

  /**
   * Per-user team preferences. Tracks the user's active team (last visited)
   * and their default team (used as the home/fallback team).
   */
  userTeamPreferences: defineTable({
    userId: v.string(),
    defaultTeamId: v.optional(v.id("teams")),
    activeTeamId: v.optional(v.id("teams")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_defaultTeamId", ["defaultTeamId"])
    .index("by_activeTeamId", ["activeTeamId"]),
});
