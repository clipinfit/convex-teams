import type { Doc, Id } from "../_generated/dataModel.js";
import type { MutationCtx } from "../_generated/server.js";

/** The host supplies this policy from trusted configuration. */
export function validateSeatLimit(seatLimit: number | undefined) {
  if (
    seatLimit !== undefined &&
    (!Number.isSafeInteger(seatLimit) || seatLimit < 0)
  ) {
    throw new Error("Seat limit must be a nonnegative safe integer.");
  }
}

export async function grantMembership(
  ctx: MutationCtx,
  args: {
    teamId: Id<"teams">;
    userId: string;
    role: "admin" | "member";
    seatLimit?: number;
  },
): Promise<Doc<"teamMemberships">> {
  validateSeatLimit(args.seatLimit);
  const team = await ctx.db.get(args.teamId);
  if (!team || team.status === "deleted") throw new Error("Team not found.");
  const existing = await ctx.db
    .query("teamMemberships")
    .withIndex("by_teamId_userId", (q) =>
      q.eq("teamId", args.teamId).eq("userId", args.userId),
    )
    .unique();
  if (existing) return existing;
  if (args.seatLimit !== undefined) {
    // Read only enough rows to determine whether this grant fits.
    const members = await ctx.db
      .query("teamMemberships")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .take(args.seatLimit);
    if (members.length >= args.seatLimit)
      throw new Error("Team seat limit reached.");
  }
  const now = Date.now();
  const id = await ctx.db.insert("teamMemberships", {
    teamId: args.teamId,
    userId: args.userId,
    role: args.role,
    createdAt: now,
    updatedAt: now,
  });
  const member = await ctx.db.get(id);
  if (!member) throw new Error("Membership creation failed.");
  return member;
}
