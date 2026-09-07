import type { QueryCtx } from "../_generated/server.js";

/** Status is part of the index so deletion history cannot expand this read. */
export async function getLiveTeamBySlug(
  ctx: Pick<QueryCtx, "db">,
  teamSlug: string,
) {
  const [active, legacy] = await Promise.all([
    ctx.db
      .query("teams")
      .withIndex("by_teamSlug_status", (q) =>
        q.eq("teamSlug", teamSlug).eq("status", "active"),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("teams")
      .withIndex("by_teamSlug_status", (q) =>
        q.eq("teamSlug", teamSlug).eq("status", "pending_payment"),
      )
      .order("desc")
      .first(),
  ]);
  if (!active) return legacy;
  if (!legacy) return active;
  return active._creationTime >= legacy._creationTime ? active : legacy;
}
