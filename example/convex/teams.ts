import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { TeamsClient } from "../../src/client/index.js";
import { components } from "./_generated/api.js";
import { mutation, query } from "./_generated/server.js";

const teams = new TeamsClient(components.teams);
// Replace this with a query of trusted host entitlements in the same mutation.
const SEAT_LIMIT = 2;

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated.");
    return teams.createTeam(ctx, identity.subject, args.name);
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated.");
    return teams.listTeams(ctx, identity.subject, args.paginationOpts);
  },
});

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email || identity.emailVerified !== true)
      throw new Error("A verified email is required.");
    return teams.acceptInvite(ctx, {
      userId: identity.subject,
      email: identity.email,
      token: args.token,
      seatLimit: SEAT_LIMIT,
    });
  },
});
