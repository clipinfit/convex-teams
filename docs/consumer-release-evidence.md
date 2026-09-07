# Consumer release evidence

Date: 2026-09-07. These checks prepare release and adoption. Production remains on the existing Feedtwin implementation.

## Feedtwin production inventory

The read-only Convex CLI inventory completed at 17:07 UTC. It returned fewer than the 1,001-row inspection limit for every selected table. No user IDs, emails, tokens, or source rows are stored in this report.

| Table | Rows | Relevant state |
| --- | ---: | --- |
| teams | 4 | All active; four consistent owners |
| teamMemberships | 6 | Three distinct users; no duplicates or orphan memberships |
| teamInvites | 2 | Both accepted |
| projectInvites | 0 | Empty |
| projectMemberships | 0 | Empty |
| userTeamPreferences | 3 | Requires ID translation |
| projects | 1 | Host ID and creator remain host-owned |
| teamEntitlements | 1 | Billing remains host-owned |

All public team IDs are unique. There are no outstanding invitations in this snapshot.

Run `node scripts/inspect-feedtwin.mjs` to repeat the aggregate inventory. The optional argument selects the Feedtwin backend directory. The script explicitly inspects production and does not mutate it. It fails if a table reaches the inspection limit.

## Invitation policy

Retain the two accepted invitation records in Feedtwin as historical records. Import their resulting memberships through the membership snapshot. Do not recreate invitations, copy accepted tokens into convex-invite, or send replacement emails.

At cutover, disable the old invitation acceptance and creation routes. New invitations must use the component lifecycle. Repeat the production inventory before cutover. If pending, errored, or unknown invitation states appear, stop and resolve them before cutover. The current zero-outstanding result must not be assumed for a later deployment.

Pedalclass is not in production. It needs a first-adoption privacy policy, not a production legacy invitation migration.

## Pedalclass privacy rehearsal

Run `node scripts/rehearse-consumer.mjs pedalclass`. The script copies the current non-ignored package source into a temporary workspace, including local edits. It excludes environment files and installs the packed teams artifact. It does not change the original consumer.

The consumer's actual schema and functions run in convex-test. A new test adds an admin teammate and verifies that private classes, media, and export operations remain owner-only. The owner retains access. The full backend suite passed with 24 tests on Convex 1.45.0. Existing backend tests also cover completed export downloads and worker ownership rules.

This proves that mounting teams and adding membership does not broaden the current private-content checks. Shared content remains a separate product feature. No production data or deployment credentials are copied into the rehearsal.

## Compatibility

Feedtwin currently installs Convex 1.31.7. It must upgrade before it consumes teams. The isolated Feedtwin rehearsal uses 1.45.0. Pedalclass already declares Convex ^1.45.0.

The package peer range is `>=1.43.0 <2.0.0`. The packed consumer check passes on 1.43.0 and 1.45.0. Use `CONVEX_SMOKE_VERSION=1.45.0 bun run pack:smoke` to select the latter. This tests declared exports, component mounting, invitation pagination, and transactional acceptance rollback on a native local backend. It does not claim compatibility with a future Convex major version.

## Feedtwin development rehearsal

Run `node scripts/rehearse-consumer.mjs feedtwin`. The isolated copy mounts teams alongside Feedtwin's Stripe, rate limiter, and Resend components. It upgrades Convex to 1.45.0 only in the temporary copy.

A four-team, six-membership fixture matches the observed production shape with synthetic values. It uses Feedtwin's actual schema and `assertProjectAccessForTeam` implementation. Repeated imports preserve IDs and roles. A native anonymous backend also mounts the full consumer, imports a team twice, and checks owner access and outsider denial through a public test query. The temporary issuer is a synthetic domain. Both the source test and native check pass.

This is a shadow comparison in an actual consumer development copy. It does not replace all Feedtwin membership reads or route production traffic to teams. Production cutover still needs the host adapters and the recorded migration procedure.

## Remaining work

Finish recovery reconciliation, final release candidate checks, and publication. The consumer rehearsals do not switch production traffic to the component.
