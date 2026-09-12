# @clipin/convex-teams

[Website](https://convex-teams.vercel.app) · [Documentation](https://convex-teams.vercel.app/docs)

A Convex component for adding teams and shared workspaces to your app. It manages team profiles, members, roles, invitations, and workspace selection. The API calls each workspace a `team`.

Use it to let users create a team, invite collaborators, switch workspaces, and manage access to their team.

## Features

- Shared and personal teams with unique slugs and stable public IDs.
- Owner, admin, and member roles with ownership transfer.
- Invitations with expiry, resend, revocation, and verified recipient acceptance.
- Seat limits enforced when a member joins, including concurrent requests.
- Active and default team preferences for each user.
- Paginated team, member, and pending invitation lists.
- Team deletion with background membership cleanup and preference repair.

Your app provides authentication, invitation delivery, billing, and permissions for its own content.

## Quick start

Install the component in your Convex app. It requires Convex `>=1.43.0 <2.0.0`.

```sh
npm install @clipin/convex-teams@1.0.1
```

Register the component in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import teams from "@clipin/convex-teams/convex.config.js";

const app = defineApp();
app.use(teams);
export default app;
```

Run `npx convex dev` to generate the component API. Then create a client and expose authenticated functions in `convex/teams.ts`:

```ts
import { TeamsClient } from "@clipin/convex-teams";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { mutation, query } from "./_generated/server.js";

const teams = new TeamsClient(components.teams);

export const create = mutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authorized.");
		return teams.createTeam(ctx, identity.subject, args.name);
	},
});

export const list = query({
	args: { paginationOpts: paginationOptsValidator },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authorized.");
		return teams.listTeams(ctx, identity.subject, args.paginationOpts);
	},
});
```

Call `api.teams.create` with `{ name: "Design studio" }` from your app. The result includes `teamId`, `teamPublicId`, `teamSlug`, and `teamName`. The authenticated user becomes the owner.

Call `api.teams.list` with `{ paginationOpts: { numItems: 25, cursor: null } }` to read that user's teams.

The example uses `identity.subject` as the user ID. Use the same authenticated user ID for all component calls. Derive identity in your backend; do not accept a caller-supplied user ID as proof of identity.

See the [API reference](https://convex-teams.vercel.app/docs/api) for all client methods.

## Slug allocation

A slug identifies a team in URLs. Shared teams first try a slug based on the team name. If that slug is taken, the component adds a random suffix. Personal teams always use a random suffix.

Generated slugs stay within 60 characters. Creation tries at most five candidates. If all candidates collide, creation fails without creating a team. Your app can retry.

## Roles

| Operation | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read team and member information | Yes | Yes | Yes |
| Change profile | Yes | Yes | No |
| Invite and manage non-owner members | Yes | Yes | No |
| List invitation recipient information | Yes | Yes | No |
| Transfer ownership | Yes | No | No |
| Delete team | Yes | No | No |
| Leave team | Transfer ownership first | Yes | Yes |

Each team has one owner. `transferOwnership` transfers ownership to an existing member in one transaction. The former owner becomes an admin.

Invitations and direct membership grants preserve an existing role. Use `updateMemberRole` to change a non-owner's role.

## Personal teams and workspace selection

Use `ensurePersonalTeam` to create a user's personal team if it does not already exist. Personal ownership cannot be transferred. Accepting an invitation does not create a personal team.

Use `setActiveTeam` to select the user's current workspace and `setDefaultTeam` to save their default workspace. Read these preferences with `getActiveTeam` and `getDefaultTeam`. Selecting a default team does not make it a personal team.

Preferences do not grant access to your app's data. Check current membership before each protected content operation.

## Seats and invitations

Use `createInvite`, `resendInvite`, and `revokeInvite` to manage invitations. A duplicate pending invitation produces `INVITATION_ALREADY_PENDING`. Resending rotates the token; use the invitation ID returned by `resendInvite`.

Use `acceptInvite` to grant membership to the authenticated recipient. Your backend must supply their verified email and the current `seatLimit`. Read the limit from your app's configuration in the same mutation that accepts the invitation. Apply the same policy to direct grants through `addMember`, which belongs in internal provisioning functions.

The owner consumes a seat. Pending invitations do not reserve seats. Omit `seatLimit` only for unlimited teams. A limit must be a nonnegative safe integer.

Concurrent requests cannot exceed the seat limit. Duplicate grants and role changes do not consume extra seats. If a team is full, acceptance fails without consuming the invitation. Retry the same invitation after capacity changes.

Reducing the limit does not remove existing members. Repeated acceptance preserves the member's current role. A previously accepted invitation cannot restore a removed member.

## Paginated lists

`listTeams`, `listMembers`, and `listPendingInvites` accept `paginationOpts` and return `page`, `isDone`, and `continueCursor`. Request 1 to 100 items per page.

Pass `continueCursor` as the next request's `cursor` until `isDone` is true. Continue after an empty page too. Team pages can be empty during deletion cleanup. Team lists use membership order. Your app can sort the results for display.

## Invitation delivery

Your app sends invitation messages through its delivery provider. Create the invitation through an internal mutation, then send the returned token from a Convex action. See the [delivery example](https://github.com/clipinfit/convex-teams/blob/main/packages/example-backend/convex/delivery.ts).

Keep raw tokens out of logs, app storage, and scheduled arguments. For scheduled delivery, schedule the recipient and team information, then create the token inside the action. Use `recordDeliveryAttempt` to record delivery status.

A provider failure leaves the invitation available for explicit resend. If delivery succeeds but status recording fails, confirm the delivery state before sending again. Delivery does not have an exactly-once guarantee.

## Deletion and retention

`deleteTeam` requires the owner. It immediately denies team access and invalidates invitation grants. Background cleanup removes memberships and repairs affected preferences. Each user gets another team they can access, or no team.

A team preference can be temporarily null during cleanup. A later explicit selection takes precedence over background repair. Cleanup retries are safe.

Your app handles content deletion and subscription cancellation. Create a cleanup job in your own tables in the same mutation that calls `deleteTeam`. Reference the team by its immutable `teamPublicId`.

Call `pruneInvitations` from an internal maintenance function to expire pending invitations and remove invitation records that are no longer pending after the 90-day retention period. Each call processes a bounded batch. Run enough batches for your invitation volume.

## Errors and retries

| Error | What to do |
| --- | --- |
| `Not authorized.` | Authenticate the correct user or obtain the required role or membership. Do not retry unchanged. |
| `Team not found.` | Select another team. The team is missing or deleted. |
| `Could not allocate a unique team slug.` | Retry team creation. |
| `Team seat limit reached.` | Increase capacity or remove another member before retrying the invitation. |
| `Membership no longer exists.` | Obtain a new invitation. An accepted token cannot restore removed access. |
| `INVITATION_ALREADY_PENDING` | Use `resendInvite` to resend the pending invitation. |
| `INVITATION_EXPIRED` or `INVITATION_REVOKED` | Obtain a new invitation. |
| `INVITATION_AUDIENCE_MISMATCH` | Sign in with the verified email of the intended recipient. |
| `Membership count is not ready.` | For older teams, have the owner call `prepareMembershipCount` and wait for `ready`. |

Convex handles transaction conflicts. Let membership errors fail the acceptance mutation so the invitation and membership changes roll back together.

## Migrate existing teams

If your app already stores teams, the import API can preserve their public IDs, names, slugs, and member roles. Use `importTeam`, `importMembers`, and `finishImport` from internal migration functions.

Imports do not migrate invitations, preferences, billing, or app content. See the [migration guide](https://convex-teams.vercel.app/docs/host-contract#existing-data) for the import procedure and upgrade requirements.

See the [changelog](CHANGELOG.md) for release history.
