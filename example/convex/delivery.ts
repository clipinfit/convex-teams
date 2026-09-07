import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { action, internalMutation } from "./_generated/server.js";

export const issue = internalMutation({
  args: { userId: v.string(), teamSlug: v.string(), email: v.string() },
  returns: v.object({
    inviteId: v.string(),
    token: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(
      components.teams.invites.createInvite,
      { ...args, role: "member" },
    );
    return result;
  },
});

/** The token exists in this action's memory and the outbound message only. */
export const send = action({
  args: { teamSlug: v.string(), email: v.string() },
  returns: v.object({ state: v.union(v.literal("sent"), v.literal("failed")) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated.");
    const endpoint = process.env.INVITATION_DELIVERY_URL;
    if (!endpoint)
      throw new Error("Configure INVITATION_DELIVERY_URL in the host.");
    const issued = await ctx.runMutation(internal.delivery.issue, {
      ...args,
      userId: identity.subject,
    });
    let state: "sent" | "failed" = "failed";
    try {
      // Replace this endpoint with your mail provider. Never log the message or response body.
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: issued.email, token: issued.token }),
      });
      if (response.ok) state = "sent";
    } catch {
      state = "failed";
    }
    await ctx.runMutation(components.teams.invites.recordDeliveryAttempt, {
      inviteId: issued.inviteId,
      state,
      transport: "host-http",
    });
    return { state };
  },
});
