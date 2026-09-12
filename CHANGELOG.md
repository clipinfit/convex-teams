# Changelog

## 1.0.1 - 2026-09-12

- Rewrite the README around component features, setup, and authenticated usage examples.
- Remove repository tooling and dependency details. Clarify migration support.
- No runtime or API changes.

## 1.0.0 - 2026-09-07

- Publish as @clipin/convex-teams under the existing npm organization. Update all package imports.

- Promote the verified release candidate to the first stable version.
- Verify registry installations on Convex 1.43.0 and 1.45.0 and both consumer rehearsals.
- Document installation and the boundary between package release and production adoption.

## 1.0.0-rc.0 - 2026-09-07

- Add trusted current team-state lookup for host resource checks and recovery.
- Verify recovery after ownership changes, removal, and deletion; include attribution notices.

- Bound the Convex peer range to >=1.43.0 <2.0.0 and verify packed consumers on 1.43.0 and 1.45.0.

- Add trusted stable-ID imports with bounded membership batches and durable completion receipts.
- Add a synthetic Feedtwin import proof for ID mapping, billing references, and project-only access.

- Replace per-grant membership scans with atomic membership counts.
- Add owner-only count preparation for older component records in batches of 100. Block new grants until preparation completes.
- Bound slug allocation to five attempts with random collision suffixes and a 60-character limit.

- Use the published convex-invite 0.1.1 pagination fix and remove the local Bun patch.

- Require pagination for team listing and bound all list requests to 100 rows.
- Continue fallback repair in 25-membership batches without overriding later selections.
- Reject stale preferences during personal bootstrap.

- Integrate convex-invite as a child component.
- Preserve roles during membership grants and add atomic ownership transfer.
- Enforce trusted seat limits on acceptance and direct grants.
- Repair workspace preferences and clean up deleted workspaces in batches.
- Add component tests, a local backend example, and CI.
- Verify concurrent personal bootstrap and duplicate membership grants on the local backend.
- Establish the convex-teams package and clipinfit/convex-teams repository identities.

The component package is not published yet. The invite dependency blocker is resolved. The remaining release requirements are recorded in the PRD.

## 0.0.0-development.0 - 2026-09-07

Published the artifact in `release/claim` to claim the npm package name. It contains a development notice and licence only. This version has no component runtime.
