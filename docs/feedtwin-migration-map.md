# Feedtwin migration map

Status: source comparison only, 2026-09-07. No Feedtwin files or data were changed. This is not an executed migration.

Feedtwin still mounts Stripe, rate limiting, and Resend in `packages/backend/convex/convex.config.ts`. It does not mount teams. Its team source still combines direct team membership with project membership when it resolves access.

## Record mapping

| Feedtwin record or reference | Development migration requirement |
| --- | --- |
| `teams._id` | Create a host mapping from old host ID to new component ID. Component IDs cannot be reused as host `Id<"teams">` values. |
| `teams.teamPublicId` | Preserve the existing public identifier. Stripe references this identifier. Use trusted `importTeam` to preserve this identifier. Ordinary `createTeam` generates a new identifier. |
| `teams.ownerUserId` | Import exactly one owner membership and matching owner field. Report conflicting owner records before import. |
| `teamMemberships` | Import one membership per team and user. Do not resolve duplicate roles by silently promoting a user. |
| `userTeamPreferences` | Translate IDs with the mapping. Keep a preference only if the user can access the target workspace. |
| Personal teams | Classify them explicitly from reviewed source data. A default preference alone is insufficient evidence. |
| `teamInvites` | Inspect pending and errored records. Agree migration or explicit revocation with reissue before replacing the lifecycle. Raw tokens cannot be recovered from hashes. |
| `projectMemberships` | Keep project-scoped permissions in Feedtwin. Do not turn project-only access into team membership. |
| Projects and other host `teamId` fields | Preserve host content until each reference can resolve through the mapping. Keep creator identity separate. |
| Stripe metadata and entitlement rows | Keep billing in Feedtwin. Preserve `teamPublicId` and translate host IDs only where required. |

The source evidence is in Feedtwin's `packages/backend/convex/schema.ts`, `teams.ts`, `stripe.ts`, and `convex.config.ts`.

## Rehearsal sequence

1. Use the trusted import API to preserve public identifiers and check membership uniqueness and ownership consistency.
2. Create an isolated fixture with two teams, different fallback memberships, project-only access, pending invitations, and billing references.
3. Import the fixture with a durable ID mapping. Run the import twice to prove idempotency.
4. Compare access before and after import. Project-only access must remain project-only.
5. Exercise sign-in, switching, acceptance, ownership transfer, removal, and deletion against the component.
6. Verify that the same billing identifier and content owner resolve before and after migration.
7. Rehearse rollback before connecting a real consumer development deployment.

During cutover, freeze membership writes or route all writes to one authoritative implementation. Do not maintain two independent membership sources. A rollback after new component writes needs a reverse mapping and reconciliation of those writes. A configuration switch alone is not sufficient.

## Remaining prerequisites

The teams runtime is partly implemented. Per-user lists, seat checks, and slug allocation are bounded. The corrected convex-invite dependency is published. Legacy component records require owner-triggered membership count preparation before new grants. Final migration policy and release provenance remain open. Trusted imports and an initial synthetic fixture now pass on the local backend. The full rehearsal remains incomplete. Feedtwin integration must wait for these contracts to be complete.

## Initial import fixture: 2026-09-07

`packages/example-backend/convex/migrationProof.ts` creates two synthetic source teams and host project records. It imports each team twice, stores a durable host ID mapping, and compares team roles and project read access. It verifies unchanged billing public IDs and creator ownership. Project-only guests remain outside team membership. Run `bunx convex run migrationProof:run` from the example backend after starting local Convex.

This fixture uses small snapshots that fit one mutation. Real imports must split large membership sets into batches of at most 100. The component tests cover 202 memberships across repeated batches. A completed import returns `complete`; callers then skip all membership batches. Calling `importMembers` after completion fails, which prevents stale grants after member removal.

The source records remain intact for recovery before cutover. This is not a rollback rehearsal after new component writes. Preferences, invitation policy, lifecycle checks against the migrated fixture, reverse reconciliation, and a real development consumer deployment remain open.
