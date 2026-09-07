# Changelog

## Unreleased: 0.1.0-alpha.0

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

The component package is not published yet. The invite pagination patch and the other release requirements in the PRD remain open.

## 0.0.0-development.0 - 2026-09-07

Published the artifact in `release/claim` to claim the npm package name. It contains a development notice and licence only. This version has no component runtime.
