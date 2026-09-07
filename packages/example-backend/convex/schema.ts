import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  migrationSources: defineTable({
    teamPublicId: v.string(),
    teamSlug: v.string(),
    ownerUserId: v.string(),
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
  }),
  migrationMappings: defineTable({
    sourceId: v.id("migrationSources"),
    componentTeamId: v.string(),
    teamPublicId: v.string(),
  }).index("by_sourceId", ["sourceId"]),
  migrationProjects: defineTable({
    sourceTeamId: v.id("migrationSources"),
    creatorUserId: v.string(),
    projectOnlyUserId: v.string(),
    billingPublicId: v.string(),
  }).index("by_sourceTeamId", ["sourceTeamId"]),
});
