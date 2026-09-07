# convex-teams

[Website](https://convex-teams.vercel.app) · [Documentation](https://convex-teams.vercel.app/docs)

A Convex component for workspace identity, membership, ownership, and preferences. Public API names use `team` for a workspace.

This is a development implementation for `convex-teams`, maintained in [clipinfit/convex-teams](https://github.com/clipinfit/convex-teams). The component targets `0.1.0-alpha.0`. It is not ready for production. The published [`0.0.0-development.0` name-claim artifact](https://www.npmjs.com/package/convex-teams/v/0.0.0-development.0) contains only a development notice and licence. It does not provide a runtime API.

See [the changelog](CHANGELOG.md) and [release procedure](RELEASING.md) for versioning and release requirements.

## Workspace layout

- `packages/convex-teams`: publishable component and its runtime tests.
- `packages/example-backend`: host integration and concurrency proofs.
- `apps/web`: Next.js website and searchable Fumadocs documentation.
- `docs`: implementation plans and migration records.

Bun manages dependencies. Turborepo runs build, type checks, and tests across packages. Run `bun run dev:web` for the website or `bun run dev:example` for the local backend.

See [website deployment](docs/website-deployment.md) for Vercel settings and deployment commands.

## Run the development example

Use Bun 1.4.0 and Node.js 22 or later.

```sh
bun install --frozen-lockfile
bun run build
cd packages/example-backend
bun run dev
```

The example uses an anonymous local Convex deployment. It does not connect to Feedtwin or production data. From another terminal, run these commands at the repository root:

```sh
bun run codegen
bun run typecheck
bun run test
bun run lint
bun run build
bun run pack:check
```

Run the backend concurrency proof from `packages/example-backend`:

```sh
bunx convex run proof:run
bunx convex run proof:concurrentBootstrap
bunx convex run proof:concurrentDuplicateGrant
bunx convex run proof:largeSeatLimit
bunx convex run proof:concurrentSlugs
bunx convex run migrationProof:run
bunx convex run migrationProof:runLifecycle
```

The proof creates a development fixture. One direct grant and one invitation acceptance compete for the final seat. The expected result is one successful grant, one rejected grant, and two members.

## Component ownership

| Component | Responsibility |
| --- | --- |
| `convex-teams` | Team identity, membership, roles, ownership transfer, preferences, invitation scope, and membership grants |
| `convex-invite` | Tokens, expiry, resend, revocation, acceptance, and delivery metadata |
| Host application | Authentication, verified email, current seat policy, message delivery, billing, and content permissions |

Teams mounts `convex-invite` as its child. The host mounts only teams. See [the example configuration](packages/example-backend/convex/convex.config.ts).

Teams uses the published `convex-invite@0.1.1` dependency. This version fixes invitation pagination inside component mounts. No local dependency patch is required.

## Host integration

Create a `TeamsClient` with your host's generated `components.teams` reference. The client methods accept contexts from host Convex functions. The [host example](packages/example-backend/convex/teams.ts) derives the actor from authentication and checks that the invitation recipient has a verified email.

Never expose a submitted actor ID or email as trusted identity. Component functions become internal references in the host. Host wrappers determine which operations clients can call.

The host must check membership before each protected content operation. An active-team preference does not grant access to host tables, files, or media URLs.

## Slug allocation

Creation tries at most five slug candidates. The first shared workspace can use the name alone. Collisions use a random suffix instead of a sequential number. Personal workspaces always use a random suffix. Generated slugs stay within 60 characters. If all attempts collide, creation fails atomically and the host can retry.

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

Each team has one owner. `transferOwnership` changes the owner record and both membership roles in one transaction. The former owner becomes an admin. Invitations and direct grants preserve an existing role. Use `updateMemberRole` for an explicit role change.

Personal team creation is an explicit host operation through `ensurePersonalTeam`. A personal team has a separate personal-owner field. Default-team selection does not define personal ownership. Personal ownership cannot be transferred. Invitation acceptance does not create a personal team.

## Seats and invitations

Pending invitations do not reserve seats. On each `acceptInvite` or trusted `addMember` call, pass the current `seatLimit` from host configuration. Read that configuration in the same host mutation. Omit the limit only for an unlimited policy. A limit must be a nonnegative safe integer. The owner consumes a seat.

Seat checks read a stored membership count instead of scanning the team's members. Creation, grants, removal, and leave update that count in the same transaction. Duplicate grants and role changes do not increase it. Concurrent grants still contend on the team record so they cannot oversubscribe the final seat.

For team records created before count tracking, the owner must call `prepareMembershipCount(ctx, userId, teamSlug)` through an authenticated host mutation. It returns `counting` until background batches of at most 100 memberships finish, then returns `ready`. New grants, including invitation acceptance, fail until the count is ready. Existing access, removal, leave, and deletion remain available. A removal during counting restarts the scan. Repeated preparation and count-job delivery are safe.

A capacity failure rolls back both child invitation acceptance and the new membership. Existing members retain access after a limit reduction. Repeated acceptance preserves the member's current role. A previously accepted invitation cannot restore a removed member.

`createInvite` now creates a new invitation. A duplicate pending invitation produces `INVITATION_ALREADY_PENDING`. Use `resendInvite` to rotate its token. Use the returned invitation ID after a resend.

`listTeams`, `listMembers`, and `listPendingInvites` require `paginationOpts` and return `page`, `isDone`, and `continueCursor`. Request 1 to 100 rows per page. Team pages use membership order and can be empty during deletion cleanup. Continue until `isDone`, even after an empty page. The host can sort the returned teams for display. Member and invitation lists are separate. Use the `convex-helpers` pagination hook for a reactive host UI.

## Delivery

[The delivery example](packages/example-backend/convex/delivery.ts) authenticates the actor in a host action. It calls an internal host mutation to issue the invitation, then sends the token from action memory to the provider.

Never store or log the raw token. Never include it in scheduled arguments. To schedule delivery, schedule only the recipient and team information, then issue the token inside the action. Record only safe delivery metadata. The example catches provider errors and returns a fixed state without provider error text.

A provider failure leaves the invitation available for explicit resend. If the provider succeeds but metadata recording fails, delivery is uncertain. Reconcile that state before sending another message. No exactly-once delivery guarantee is made.

## Deletion and retention

`deleteTeam` requires the owner. It immediately marks the team deleted, which denies access and invalidates its invitation grants. Cleanup removes memberships and repairs affected preferences in batches of 50. Each user gets a fallback they can access, or no workspace. Fallback repair checks saved preferences directly, then scans 25 memberships per transaction. It schedules another page if necessary. A null redirect can therefore be temporary while cleanup continues. A later explicit selection takes precedence over the background repair. The final cleanup removes the team record. Cleanup retries are safe.

The host must keep any content and subscription cleanup job in its own tables. Create that job in the same host mutation that requests deletion. Use the immutable `teamPublicId` as its reference. Teams does not cancel subscriptions or delete host content.

Call `pruneInvitations` from trusted host maintenance. The invite component expires pending records and removes terminal records after its 90-day retention period. Each call is bounded. The host must run enough batches for its invitation volume.

The old `teamInvites` table and `pending_payment` schema value remain only for migration inspection. No invitation operation uses the old table. Old tokens cannot be accepted by the new lifecycle. Do not deploy over existing invitation data until migration or explicit revocation with reissue has been agreed. The payment activation API, generation permission, and fixed profile throttle have been removed.

## Errors and retries

- `Not authorized.`: authenticate the correct actor or obtain the required membership. Do not retry unchanged.
- `Team not found.`: the team is missing or deleted. Resolve another workspace.
- `Team seat limit reached.`: update capacity or remove another member before retrying the same invitation.
- `Membership no longer exists.`: obtain a new invitation. An accepted token cannot restore removed access.
- `INVITATION_EXPIRED`, `INVITATION_REVOKED`, or `INVITATION_AUDIENCE_MISMATCH`: use the correct recipient or obtain a new invitation.

Convex handles transaction conflicts. Do not catch a membership-grant error and return success from a host acceptance mutation.

See [the completion PRD](docs/prd-component-completion.md) for remaining work and [the Feedtwin migration map](docs/feedtwin-migration-map.md) for consumer constraints.

## Trusted imports

`importTeam` preserves an existing public team ID and creates its owner. `importMembers` accepts batches of 1 to 100 memberships. `finishImport` checks ownership and the expected count before closing the import. These methods are for trusted internal migration jobs, not public user endpoints.

Keep membership writes paused and delay consumer cutover until all batches and access comparisons pass. Imported teams are active immediately; the component does not enforce the host migration freeze. Store the old-host-ID to component-ID mapping in the host. Keep project-only memberships, billing references, and content ownership in the host.

Open batches are repeatable with identical roles. Conflicts fail the whole batch. Once complete, skip batch replay. Durable receipts prevent a completed import from restoring removed members or recreating a deleted team. Retain the source snapshot and receipts. Imports do not migrate preferences, invitations, or source timestamps. See the [migration contract](https://convex-teams.vercel.app/docs/host-contract).
