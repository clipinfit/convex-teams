# Complete convex-teams for application use and CLIPIN OSS

Date: 2026-09-07.
Status: implementation in progress. The 2026-09-07 continuation completed the local baseline, critical membership fixes, and child invitation integration. Consumer migration and release preparation remain incomplete. See the implementation handoff below.

## Purpose

Complete the extracted teams component so applications can use personal and shared workspaces with consistent membership and invitation rules. Prepare it for an independent CLIPIN open-source release.

The founder confirmed Feedtwin and Pedalclass as the first target consumers. Neither adoption is complete. Feedtwin provides the migration case. Pedalclass provides the private-content adoption case. See [Consumer and permission architecture decisions](#consumer-and-permission-architecture-decisions-2026-09-07). Pedalclass pricing and wider product strategy remain separate.

The review inspected local source files. It did not run the component, install dependencies, test a deployment, or verify registry and remote repository ownership. Recheck the source before implementation.

## Product outcome

A person can use a personal workspace and join shared workspaces. Each application can associate content, a subscription, and usage with a stable workspace identifier. The application retains the identity of the person who performs each action.

Studios, gyms, companies, and informal teams use the same workspace model. Separate business-type entities are outside the first release.

The existing API uses the term `team`. In this document, a workspace means that same ownership boundary. A public API rename is not required. Record the naming decision before changing exported symbols.

## Scope and ownership

| Layer | Responsibility |
| --- | --- |
| `convex-invite` | Invitation tokens, expiry, resend, revocation, acceptance lifecycle, and delivery status |
| `convex-teams` | Workspace identity, membership, roles, ownership transfer, membership checks, invitation scope, and membership grants |
| Host application | Authentication, trusted email identity, email delivery, billing, product permissions, usage accounting, and content ownership |
| Host UI | Workspace switcher, member settings, invitation screens, and account recovery |

Permissions answer who can perform an action. Plan entitlements answer what a workspace has purchased. Keep these concepts separate. The component can enforce a trusted member limit without containing plan names or payment-provider logic.

The proposed integration uses `convex-invite` as a direct child-component dependency. Prove the transaction and test-registration behavior in a runnable example before committing to the final API.

The first release excludes payment checkout, pricing tiers, usage metering, gym locations, class scheduling, product-specific project roles, and a general-purpose permission language. It also excludes a shared React UI package. Applications can add these features around the component.

## Current implementation and pending work

These findings describe the local files on the review date. They are source-review findings, not reproduced runtime failures.

| Priority | Finding | Required result | Evidence |
| --- | --- | --- | --- |
| P0 | Invitation acceptance overwrites an existing membership role, including an owner role. | Acceptance preserves existing membership authority. Role changes use an explicit authorized operation. | [acceptInvite](../src/component/invites.ts) |
| P0 | Seat capacity is checked for a new invitation, but not at acceptance. | Every membership grant enforces the current trusted limit under concurrent requests. | [invitation creation and acceptance](../src/component/invites.ts) |
| P0 | Deletion assigns affected users the actor's default team. Other users may not belong to that team. | Each user's fallback is a workspace they can access, or an explicit no-workspace state. | [deleteTeam](../src/component/teams.ts) |
| P0 | Ownership is duplicated in `ownerUserId` and membership roles. No ownership-transfer operation is exposed. | Ownership remains consistent through transfer, invitations, role changes, removal, and deletion. | [schema](../src/component/schema.ts), [client](../src/client/index.ts) |
| P1 | Invitations duplicate the lifecycle already implemented in convex-invite. | One invitation lifecycle remains after integration. | [invitations](../src/component/invites.ts), [invite package](../../../convex-invite/packages/convex-invite/README.md) |
| P1 | The README schedules an email action with a raw token. | The delivery example follows convex-invite's rule against persisting or logging raw tokens. | [README](../README.md), [invite guidance](../../../convex-invite/AGENTS.md) |
| P1 | `pending_payment`, `canGenerate`, fixed profile throttling, and mandatory personal bootstrap encode application policy. | Remove these policies from the core or expose a documented host-controlled option. | [schema](../src/component/schema.ts), [teams](../src/component/teams.ts), [invitations](../src/component/invites.ts) |
| P1 | Deletion scans all user preferences. Invitation expiry scans all invitations. Other collection reads also need review. | Listing and maintenance use indexed, bounded work. Large workspaces do not require one unbounded mutation. | [teams](../src/component/teams.ts), [invitations](../src/component/invites.ts) |
| P1 | Feedtwin uses local team tables and functions. Its component configuration does not register teams. | A real consumer proves the extracted API. Do not describe Feedtwin as already migrated. | [Feedtwin config](../../feedtwin/packages/backend/convex/convex.config.ts), [Feedtwin teams](../../feedtwin/packages/backend/convex/teams.ts) |
| P1 | The source has a test registration helper, but no implementation test suite was found. | Component-runtime tests cover the invariants below. | [test helper](../src/test.ts), [package scripts](../package.json) |
| P1 | Teams declares Convex `>=1.17.0`; the local invite package declares `>=1.43.0`. | Declare and test a compatible minimum version across the package, example, and test runtime. | [teams package](../package.json), [invite package](../../../convex-invite/packages/convex-invite/package.json) |
| P1 | Metadata uses `@convex-dev/teams` and `get-convex` URLs. No root licence text was found. | Establish CLIPIN package identity, attribution, licence text, and release metadata. | [package](../package.json), [wearables precedent](../../convex-wearables/packages/convex-wearables/package.json) |
| P1 | `git -C ../convex-teams status` reports that the directory is not a Git repository. | Establish the intended repository without overwriting local files. Verify the remote before publishing. | Local command result on 2026-09-07 |

P0 blocks use with real shared accounts. P1 blocks the proposed stable component release.

## Functional requirements

### Workspace identity and ownership

- Use a stable identifier for host content, invitation scope, and billing references. Renaming a slug must not change ownership.
- Keep membership unique for each workspace and user pair.
- Use one owner per workspace as the proposed first-release model. Transfer ownership atomically to an existing member.
- Keep `ownerUserId` and the owner membership consistent if both representations remain.
- Prevent the last owner from leaving or losing ownership through a generic role operation.
- Make personal workspace creation idempotent under concurrent bootstrap calls.
- Let the host decide whether sign-in or invitation acceptance creates a personal workspace.
- Distinguish a personal workspace from a selected default workspace if they have different rules. The current preference alone must not silently define ownership policy.

### Authorization and membership

- Derive the acting user from host authentication. Public application endpoints must not trust a submitted actor ID or email.
- Define and test an explicit owner, admin, and member permission table.
- Use owner-only deletion as the proposed default. Record any broader deletion policy before implementation.
- Prevent admins from granting ownership through invitations or generic role updates.
- Keep application permissions, such as class editing and AI generation, outside the generic role table.
- Reject reads and writes that require membership after removal or workspace deletion. An active-workspace preference never grants access.
- Expose enough membership information for hosts to protect their own content. Component membership does not automatically secure host tables or signed media URLs.

### Invitation integration

- Mount convex-invite within the teams component. Follow its existing client and runtime-test patterns.
- Use an immutable workspace identifier as the invitation resource. Verify scope, workspace state, recipient, and allowed role before membership changes.
- Accept the invitation and grant membership in one transaction. A failed membership grant must not consume the invitation.
- Make repeated acceptance safe. An existing member must not receive an implicit role change.
- Recheck the current seat policy during acceptance and every direct membership grant.
- Define whether pending invitations reserve seats. Account for expiry, resend, revocation, and plan changes under that policy.
- Preserve existing members after a plan downgrade unless the host explicitly requests removal. Block new grants when over capacity.
- Keep tokens out of stored records, scheduled arguments, and logs. Prove a delivery flow using the invite package's supported pattern.
- Remove the old token lifecycle after migration. If old invitations exist, choose between compatible migration and explicit revocation with reissue.

### Workspace lifecycle and preferences

- Make a deleting workspace inaccessible before background cleanup begins.
- Revoke or invalidate its invitations. A delayed acceptance must not restore membership.
- Clean up memberships and preferences in bounded batches. Make retries safe.
- Choose a valid fallback separately for each affected user. Allow no fallback when the user has no remaining membership.
- Support leaving or deleting a default workspace through a defined replacement or no-workspace flow.
- Give the host a documented way to coordinate content deletion and subscription cancellation. The component must not directly operate a payment provider.
- Document the retained records and final deletion behavior. Avoid indefinite growth from completed invitations and deleted workspaces.

### Package and public API

- Propose `@clipin/convex-teams` as the package identity. Verify namespace access and the intended remote before release.
- Confirm source provenance and preserve required attribution. Use the wearables licence and repository structure as references, not proof of teams ownership.
- Keep authentication, billing, and email providers replaceable.
- Validate external arguments at the host boundary. Derive public types from authoritative validators where possible.
- Regenerate component types through a documented example application. Do not hand-edit generated declarations to make the build pass.
- Include the licence, README, compiled entry points, declarations, component config, and test registration in the package.
- Document public errors and retry behavior for expired invitations, insufficient capacity, missing membership, and deleted workspaces.

## Required validation

Use component-runtime tests for behavior that depends on Convex transactions and component boundaries. Mocked client calls alone do not establish these guarantees.

The release test matrix covers:

- Isolation between two workspaces, including guessed identifiers and stale preferences.
- Owner preservation when accepting an invitation for an existing member.
- Atomic ownership transfer and prevention of an ownerless workspace.
- Recipient verification, expiry, revocation, resend invalidation, and repeated acceptance.
- Rollback of invitation acceptance when membership creation fails.
- Concurrent attempts to take the last seat, including direct grants and invitation acceptance.
- Plan changes between invitation creation and acceptance.
- Concurrent personal bootstrap and duplicate membership prevention.
- Removal and deletion while invitations or host operations are pending.
- Deletion fallback for users whose remaining memberships differ from the actor's.
- Bounded cleanup across multiple pages and retries.
- No raw token persistence through the documented delivery example.
- Installation of a packed artifact in a clean example, including child-component registration and generated types.

The package declares `build`, `typecheck`, `lint`, and `test` scripts. Verify those scripts after establishing dependencies and tool configuration. Add package-content checks and CI. Record commands and results in the implementation handoff.

## Implementation phases

### Phase 1: establish the contract and working baseline

- [x] Inspect the current files and preserve unrelated local work.
- [x] Establish Git tracking and the intended repository identity. The verified repository is `clipinfit/convex-teams`.
- [x] Record the decisions listed below.
- [x] Establish dependencies, tooling, code generation, and a runnable component example.
- [x] Add runtime tests that reproduce the ownership and fallback findings. Validate capacity rollback and concurrency after the fixes.

Exit condition: the example runs, and the failing tests demonstrate the current ownership, capacity, and fallback problems.

### Phase 2: complete the shared component

- [x] Fix the reproduced ownership and fallback defects. Enforce current host capacity on invitation and direct grants.
- [x] Integrate convex-invite and remove duplicate invitation lifecycle code. A tracked dependency patch is required until the invite pagination fix is released.
- [ ] Remove application-specific payment and generation policies.
- [ ] Implement bounded cleanup and workspace lifecycle behavior.
- [x] Document and test the host authorization and delivery boundaries.

Exit condition: the required runtime test matrix passes for the shared component.

### Phase 3: prove consumer migration

- [ ] Complete final API comparison against Feedtwin. An initial source comparison is recorded in `feedtwin-migration-map.md`.
- [ ] Prepare a migration map for team identifiers, memberships, preferences, pending invitations, projects, and billing references.
- [ ] Preserve Feedtwin's product-specific project roles and team entitlements in Feedtwin.
- [ ] Rehearse migration using a local or development fixture. Document rollback and how to avoid duplicate sources of membership truth.
- [ ] Integrate one real consumer in development and exercise sign-in, switching, invitation acceptance, removal, and deletion.

Exit condition: a consumer runs against the component and the migration has repeatable validation. Feedtwin is the preferred first proof because the component was extracted from it. Do not change production data as part of the rehearsal.

### Phase 4: prepare the independent release

- [ ] Finalize CLIPIN package metadata, licence, contribution guidance, security contact, and release instructions.
- [ ] Replace unfinished installation claims in the README with verified examples.
- [ ] Validate a clean packed installation and supported Convex versions.
- [x] Add CI for build, type checks, lint, runtime tests, and a package dry run. Clean consumer installation remains a separate release requirement.
- [ ] Document compatibility and migration limits.

Exit condition: the package is release-ready. Publishing is a separate action from preparing this PRD or implementing its backlog.

## Decisions to record before changing the public API

These are recommended defaults, not completed founder decisions. The implementation session can resolve routine API choices and record its reasoning.

| Decision | Proposed starting point |
| --- | --- |
| Public terminology | Keep `team` symbols until there is a concrete benefit to an API rename. Explain workspace ownership in the documentation. |
| Ownership | One owner with an explicit transfer operation. |
| Personal workspace | Optional host-controlled bootstrap. Do not create one as an undocumented invitation side effect. |
| Core roles | Owner, admin, and member. Keep product-specific content roles in the host. |
| Deletion | Owner-only by default, with immediate access denial and bounded cleanup. |
| Seat policy | A trusted host policy checked for every grant. Decide reservation semantics before implementation. |
| Existing invitations | Inspect actual deployed data before choosing migration or revocation with reissue. |
| Package identity | `@clipin/convex-teams`, subject to namespace and repository verification. |

## Pedalclass follow-up

After the component is proven, Pedalclass needs its own adoption plan. That plan maps owner-based classes, media, themes, exports, and generation records to workspaces. Keep creator identity separately from workspace ownership.

The adoption plan must define which existing personal assets stay private. Team membership alone must not broaden audio access. It must also cover background jobs, signed downloads, member removal, and usage charged to the correct workspace.

Pricing remains outside this PRD. The component enables workspace subscriptions and shared allowances. It does not determine prices, included seats, export limits, storage allowances, or whether a Studio offer launches first.

## Start the next Codex session

Open the repository root and use this prompt:

> Read `docs/prd-component-completion.md`. Recheck the current source and begin Phase 1, then work through the component backlog. Treat Feedtwin as an unmigrated source application. Integrate the existing convex-invite package instead of maintaining a second invitation lifecycle. Keep pricing and product-specific billing outside the component. Preserve local work. Record resolved decisions, verification results, and remaining tasks in this document. Prepare consumer migration in development before any production change. Do not publish a package as part of this session unless I request it.


## Implementation handoff: 2026-09-07 continuation

### Decisions applied

- Keep public `team` names. Keep one owner and use an explicit atomic transfer to an existing member. The previous owner becomes an admin.
- Preserve existing roles during all membership grants. Generic role changes cannot change the owner.
- Make deletion owner-only. Permit a user to leave or delete their default team and receive a null redirect when no workspace remains.
- Keep personal ownership separate from preferences through `personalOwnerUserId`. Bootstrap is explicit. Personal ownership cannot be transferred.
- Pending invitations do not reserve seats. The host passes the current trusted `seatLimit` to every direct grant and acceptance. Omission means unlimited. Read host entitlements in the same mutation as the grant.
- Use immutable `teamPublicId` for child invitation scope. Repeated acceptance cannot restore removed membership.
- Delete the team record after bounded membership and preference cleanup. Missing teams invalidate invitation grants. The host owns durable content and billing cleanup jobs.
- Retain the legacy invitation table and payment status only for data inspection. No new invitation operation uses that table. Existing deployments require a reviewed migration or explicit revocation with reissue before upgrade.

### Implemented

The repository now has local Git metadata, a Bun lockfile, working scripts, Biome configuration, and an anonymous local Convex example. No remote is configured. GitHub lookups for `clipin/convex-teams` and `dciccale/convex-teams` did not resolve an accessible repository. This does not establish package ownership.

`src/component/invites.ts` now delegates token and lifecycle operations to the published `convex-invite@0.1.0` dependency. `src/test.ts` registers both the teams component and its invite child. The example successfully mounts `teams/invite` on the local backend. Convex generated the component and example declarations through the example project. No generated declarations were edited by hand.

A shared grant function protects role preservation, live-team state, and capacity. The new ownership transfer updates both ownership representations atomically. Removal and deletion repair each user's preferences separately. Deletion denies access before cleanup and processes records in batches of 50. Cleanup removes the final team record and tolerates retries.

Member and invitation lists use pagination. Per-user team access still has unbounded reads and requires follow-up. The fixed profile throttle, payment activation operation, and generation permission were removed. The legacy payment schema value remains pending data migration decisions.

The README now documents the host authentication, seat, delivery, deletion, and retry contracts. The example checks verified email and sends tokens only from host action memory. It records fixed delivery metadata after success or failure. CI runs the repository checks. CI has not run on a remote repository.

### Dependency defect found on the local backend

The published invite package uses built-in `.paginate()`, which Convex rejects inside a component. `convex-test` did not reproduce this restriction. The local backend reproduced it when checking member pagination.

Teams now uses `convex-helpers` pagination. `patches/convex-invite@0.1.0.patch` applies the same correction to the invite package's three list queries. Bun applies the tracked patch during installation. The patch includes source and distributed JavaScript plus the helper dependency. The sibling invite repository was not modified or published.

A corrected invite release is a stable-release prerequisite. A downstream npm installation does not automatically apply this repository's Bun patch. Do not treat a successful package dry run as proof of an independently usable release.

### Verification

- Installed dependencies with `bun install --frozen-lockfile`.
- Before fixes, three runtime tests failed on owner demotion during acceptance, owner demotion during direct grants, and incorrect deletion fallback.
- `bun run test`: 16 tests passed across the component and host example. Coverage includes child acceptance rollback on capacity failure, role preservation, transfer, recipient checks, resend, revocation, expiry, scope and role rejection, repeated acceptance after removal, optional personal bootstrap, null fallbacks, multi-batch cleanup, nested registration, and delivery success and failure.
- `bun run typecheck`: passed for the component, client, tests, and host example.
- `bun run lint`: passed.
- `bun run build`: passed.
- `npm pack --dry-run --json`: passed. The artifact excludes test files. Licence text and release metadata still need work.
- From `example`, `CONVEX_AGENT_MODE=anonymous bunx convex dev --once` installed and ran the component tree locally. `bunx convex codegen --component-dir ../src/component` regenerated declarations. The CLI skipped its own automatic type checks because of its example/component path lookup. The explicit root typecheck above covers both paths.
- From `example`, `bunx convex run proof:run` raced a direct grant against invitation acceptance for the last seat. The backend returned one successful grant, one rejected grant, and two members. This check uses actual Convex transactions, not mocked calls.

### Next work

1. Apply the tracked pagination correction in convex-invite's source repository, add its regression coverage, and prepare a corrected release. Publishing still requires a separate user request.
2. Finish bounded per-user access and fallback resolution. Expand concurrency coverage to personal bootstrap and duplicate same-user grants on the local backend.
3. Inspect existing deployment data before removing the legacy invitation table and payment schema value. Confirm the migration policy. Do not infer that legacy data is absent.
4. Implement an import API that preserves public team identifiers. Rehearse the [Feedtwin migration map](feedtwin-migration-map.md) with an isolated fixture, then integrate a real consumer in development.
5. Verify CLIPIN namespace access, source provenance, licence attribution, and the intended remote. Complete clean packed installation, supported-version checks, and release documentation.

No Feedtwin or Pedalclass files were changed. No production data was accessed. No package was published. No commits were created.


## Repository and npm checkpoint: 2026-09-07

The user confirmed `clipinfit/convex-teams` as the public repository and requested that the npm name be claimed. This supersedes the proposed scoped package identity. The package name is `convex-teams`.

- Connected `origin` to `git@github.com:clipinfit/convex-teams.git` and pushed `main`.
- Created checkpoint `df93464`, `feat: establish teams component baseline`.
- Created checkpoint `c9d2427`, `chore: prepare package identity and versioning`.
- GitHub CI passed for both checkpoints.
- Published `convex-teams@0.0.0-development.0` from `release/claim`. npm confirmed the repository and publisher account. Its registry integrity is `sha512-aPoYXuaqK2uMYpRGPhzDX5X1FEHpzKfc0Jx21OoGR8Bs+Kyq10VuiNcaS7CXcFgPqNYMoG1D1/SzP6WzImsZrg==`.
- Tagged the claim source commit `c9d2427` as `v0.0.0-development.0` and pushed the tag. npm assigned both `development` and `latest`; removal of `latest` was rejected with HTTP 400. Both tags still refer to the notice-only artifact.
- The name-claim artifact contains only a development notice, package metadata, and Apache-2.0 licence. It does not publish the unfinished component runtime.
- Set the source component version to `0.1.0-alpha.0`. Added `CHANGELOG.md`, `RELEASING.md`, package-content checks, and a guard against component publication with dependency patches or uncommitted changes.
- Added the Apache-2.0 licence text, consistent with the original manifest. Feedtwin source history identifies Denis Ciccale as a contributor. Any remaining third-party source attribution must still be reviewed before the component release.
- The local backend passed concurrent personal bootstrap with one resulting team and duplicate same-user grants with one resulting membership. The suite now has 18 passing tests.

Remaining release work includes the corrected convex-invite dependency, bounded per-user access reads, the legacy data policy, and the consumer migration rehearsal. Neither the component runtime nor any production migration has been released.

Checkpoint `06562a9`, `test: verify concurrent workspace provisioning`, adds the two new concurrency checks and records the publication.


## Bounded workspace reads checkpoint: 2026-09-07

`listForUser` and `TeamsClient.listTeams` now require pagination options and return a page object. The API no longer collects or globally sorts all of a user's memberships. All public list requests accept 1 to 100 rows. Deleted workspace memberships can produce an empty page with `isDone: false`; consumers must continue using the cursor.

Fallback resolution checks the two saved preferences by indexed membership lookup. If both are invalid, it scans 25 memberships per transaction. Cleanup schedules the next page when needed. Each continuation rechecks current preferences so a later explicit selection wins. During that interval, the active workspace or redirect can be null. Personal bootstrap always uses an accessible personal workspace when saved preferences are stale.

Status-aware indexes bound slug and personal-workspace lookup. No runtime teams or invitation wrapper uses `.collect()`. Seat checks still read up to the trusted seat limit and need a final large-capacity review. Slug allocation retries also need a final workload review.

Validation: 22 runtime tests pass. Type checks, lint, build, and package-content checks pass. The local backend still passes the final-seat race, concurrent personal bootstrap, and duplicate same-user grant proofs with the paginated API. Generated component types were regenerated through the example.

## Invite correction and packed consumer checkpoint: 2026-09-07

Checkpoint `8e88184` contains the bounded workspace reads. GitHub CI passed.

The invite correction is now prepared in an isolated worktree of the source repository. Commit `5c64360` on `fix/component-pagination` replaces native pagination in all three management queries and adds regression coverage. [Draft invite PR #1](https://github.com/dciccale/convex-invite/pull/1) contains the fix. The invite package passed 26 tests, type checks, lint, build, and its clean package verification. No invite version was published.

`bun run pack:smoke` now creates a fresh npm consumer from the teams archive. It checks exported types, the exported test registration helper, and an actual local Convex backend. With the corrected local invite archive, the check passed: two distinct invitation pages, two members after acceptance, and successful retry after a capacity failure rolled back acceptance.

This candidate archive still identifies itself as `convex-invite@0.1.0`; it is an unpublished source build, not the registry artifact. The source fix needs a new published version. The teams patch and publication guard remain until that version is available. Release validation must then pass without a candidate argument.

Next release gates:

1. Review and release the corrected invite package, then update the teams dependency and remove the patch. Publishing requires a separate user request.
2. Complete the large-capacity seat check and slug allocation workload review.
3. Decide the legacy data migration policy from deployment evidence.
4. Add stable-identifier imports, rehearse the Feedtwin migration fixture, and validate a real development consumer.
5. Complete attribution and supported-version checks. Run the registry-only packed consumer check before a component release.


## Monorepo and documentation checkpoint: 2026-09-07

The user requested a monorepo based on convex-chat and a website deployed to Vercel. The full reference repository is `/Users/denis/git/convex-chat`; the adjacent partial folder is not its working checkout.

- `packages/convex-teams` contains the publishable component, source, tests, and package metadata.
- `packages/example-backend` contains the authenticated host example and backend proofs. It imports the workspace package through public exports.
- `apps/web` contains a Next.js 16 and Fumadocs website with seven searchable documentation pages.
- The root is private. Bun workspaces and Turborepo manage builds, type checks, and tests. The component version stays at the unpublished `0.1.0-alpha.0`.
- The invite patch stays at the root. The component publication guard explicitly checks the root manifest after the move.
- Website copy states that the npm artifact contains only a name-claim notice. Website publication does not publish the component runtime.

The 22 component and host tests pass. Type checks, lint, package-content checks, and website production build pass. The clean packed consumer check still passes with the corrected local invite archive. The browser check covers desktop and mobile layouts, documentation navigation, code selection, and search results.

The Vercel project is `convex-teams` under the `clipin` team, with `apps/web` as its root directory. Deployment credentials and local Convex files stay ignored.


Vercel production deployment succeeded from checkpoint `9b8dbef`, which pins Bun 1.4.0 for Vercel's build environment. The first attempt used Vercel's older Bun and could not parse the lockfile. The live website is [convex-teams.vercel.app](https://convex-teams.vercel.app), with docs at [/docs](https://convex-teams.vercel.app/docs). The project is connected to GitHub for production deployments from `main`.

GitHub CI passed for the monorepo and Bun fix. Public HTTP checks passed for the landing page and all seven docs routes. Production search returns relevant results. See [website deployment](website-deployment.md) for repeatable deployment commands. No component runtime was published.


## Invite dependency released: 2026-09-07

The user authorized publication of the invite correction. [PR #1](https://github.com/dciccale/convex-invite/pull/1) is merged. `convex-invite@0.1.1` is published on npm with `latest` pointing to it. The exact source commit is `fe5103072db3d8ee78d3be5776492ce9c1c22c7b`, tagged `v0.1.1`. [Release notes](https://github.com/dciccale/convex-invite/releases/tag/v0.1.1) are available.

The registry archive integrity matches the tested release archive: `sha512-a4/hRrCZE/y0QU1+4qMQi9TU/6Pdb7rZ53UwbBoopLlxBWZeCgrBwJmP7XLoK7yhfAac/QpS3gk9yPo6SR2bOA==`. The invite release passed 26 package tests, 4 host tests, full release checks, a clean package verification, and the dependency audit. The exact archive also passed the teams local backend smoke check before publication.

Teams now pins `convex-invite@0.1.1`. The `patches` directory and workspace `patchedDependencies` entry are removed. `bun run pack:smoke` passed without a candidate argument. Its fresh npm installation used the registry version, registered both components, read two invitation pages, and verified acceptance rollback and retry after a capacity failure. All 22 teams tests, type checks, lint, docs links, builds, and package-content checks pass.

The invite dependency blocker is resolved. Remaining teams release work is the capacity and slug workload review, legacy data policy, stable-identifier imports and consumer rehearsal, attribution, and supported-version checks. Re-run the registry-only smoke check on the final release candidate. The teams runtime remains unpublished at `0.1.0-alpha.0`.


## Capacity and slug workload checkpoint: 2026-09-07

Seat checks no longer read up to `seatLimit` membership rows. Each active team stores an exact count. Creation starts at one owner. Grants, removal, and leave update the count in the same transaction as the membership change. Existing grants, role changes, and ownership transfers leave the count unchanged. Grants still serialize through the team record, preserving the final-seat invariant.

The optional schema field preserves older records. An authenticated owner calls `prepareMembershipCount` to initialize them in batches of at most 100 memberships. Progress is stored as either `counting` with its cursor and subtotal, or `ready` with its exact total. New grants are blocked until ready. Existing access and removal remain available. Removals restart an in-progress scan. Repeated preparation resumes progress, and duplicate jobs cannot overwrite a ready count. Deletion makes pending count jobs no-ops. Sustained removals can delay preparation, so migration should use a quiet membership-write window.

Shared and personal slug allocation use at most five indexed candidate checks. Collision suffixes use 12 random hexadecimal characters. All generated slugs stay within 60 characters. Exhaustion fails the mutation atomically with an explicit retry error. Callers must not depend on sequential suffixes.

Validation: 29 component and host tests pass. Type checks, lint, documentation links, production build, package checks, and the registry-only packed consumer check pass. Local backend proofs pass for the final-seat race, concurrent personal bootstrap, duplicate grants, `Number.MAX_SAFE_INTEGER` seat policy, and concurrent same-name creation. Generated component declarations were regenerated with the Convex CLI. Existing local component records accepted the optional schema field without a destructive reset.

Next: implement authorized stable-identifier imports and an isolated Feedtwin migration fixture. The actual legacy invitation policy still needs deployment evidence. No Feedtwin or Pedalclass data was read or migrated, and the teams runtime remains unpublished.

## Consumer and permission architecture decisions: 2026-09-07

Status: recorded direction for the teams release. A separate permission engine is deferred. The source review did not change either consumer or inspect deployed data.

### First consumers and acceptance requirements

The consumer repositories are `../feedtwin` and `../pedalclass`, relative to the teams repository root.

| Consumer | Observed source model | Required adoption behavior |
| --- | --- | --- |
| Feedtwin | Team roles and independent project memberships. Projects and billing use existing team references. | Preserve public team identifiers and map host IDs to component IDs. Preserve project-only access without creating team membership. Keep billing and project permissions in Feedtwin. |
| Pedalclass | Classes, media, themes, generation, and exports use user ownership. | Keep existing private assets private. Define sharing explicitly before attaching assets to shared workspaces. Keep creator identity separate from workspace ownership. |

Feedtwin's `packages/backend/convex/lib/auth.ts`, specifically `assertProjectAccessForTeam`, permits a qualifying team membership or project membership. Team membership is therefore not a universal prerequisite for product access. The host must define which access paths apply to each resource. Migration must preserve intended project-only access without granting broader team authority.

Pedalclass evidence includes `packages/backend/convex/schema.ts`, `classes.ts`, `mediaAssets.ts`, `playerThemes.ts`, and `exportJobs.ts`. These files are under its backend package. Workspace adoption must preserve ownership checks for private content, including background jobs and downloads.

Release and adoption work remains open:

- [ ] Rehearse Feedtwin imports with stable public IDs, durable ID mapping, repeatable imports, and a recovery procedure. Follow the [Feedtwin migration map](feedtwin-migration-map.md).
- [ ] Compare intended access before and after import, including project-only users, member removal, team deletion, and invitation acceptance.
- [ ] Prepare Pedalclass private-content fixtures. Prove that joining a team does not expose another user's existing classes, media, or exports.
- [ ] Define explicit sharing and ownership rules before a real Pedalclass migration. Keep plan entitlements and usage policy in the host.

These requirements do not authorize production migration or establish that either adoption has passed.

### Permission engine boundary

Finish the teams release with fixed `owner`, `admin`, and `member` roles for team management. Keep product permissions in each host. A future permission engine must remain a separate, optional integration. It must not duplicate authoritative team membership.

Keep `@vllnt/convex-permissions` as an evaluation candidate. Do not add it as a required teams dependency. Do not start a replacement engine as part of this release.

The review covered version `0.1.0` and source commit `a2db4faabba934ee26eea53f48f0784b96cb95f3`. Its 13 tests, configured coverage, type checks, and build passed locally. The review was not a security audit or a production load test.

The reviewed implementation has global role definitions, scoped assignments with global fallback, retained assignments after role deletion, and reads without explicit application-level bounds. These behaviors need evaluation against consumer requirements. Sources: [schema](https://github.com/vllnt/convex-permissions/blob/a2db4fa/src/component/schema.ts), [queries](https://github.com/vllnt/convex-permissions/blob/a2db4fa/src/component/queries.ts), and [mutations](https://github.com/vllnt/convex-permissions/blob/a2db4fa/src/component/mutations.ts).

After teams, evaluate tenant-owned roles, explicit global grants, safe role deletion and recreation, bounded reads, typed grants, and resource-specific access paths. Test removal and rejoining without accidental restoration of old grants. Prefer reuse or upstream contributions when they meet these requirements. Consider a separate OSS engine if the required ownership and lifecycle model differs substantially. Package creation and its API remain undecided.

### Future compatibility and migration

An optional permission integration can preserve the teams contract. An internal redesign does not require a major release solely because its architecture changes. After `1.0`, incompatible public API or documented authorization changes require a major version under our compatibility policy. Pre-`1.0` versions remain development releases, as defined by [Semantic Versioning](https://semver.org/).

A version increase does not migrate stored component data. For a breaking upgrade, maintainers must provide migration functions where needed, deployment order, upgrade tests against existing records, and a documented recovery procedure. Consumers must adapt their wrappers, run required migrations, and verify access. Installing the npm package alone is insufficient.

Preserve stable public identifiers and the host/component ownership boundary now. These contracts allow future permission integration without requiring a teams redesign.
