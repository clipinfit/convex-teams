# First release audit

Date: 2026-09-07. Evidence applies to the current candidate source. Registry publication must be verified separately.

| Requirement | Evidence |
| --- | --- |
| Team isolation, owner preservation, transfer, and stale-access denial | `packages/convex-teams/src/component/invariants.test.ts` |
| Verified recipient, expiry, resend, revocation, repeated acceptance, and role/scope rejection | Component invariant tests and native Feedtwin acceptance checks |
| Transactional capacity rollback and current seat policy | Invariant tests, `proof:run`, and packed native consumer checks |
| Concurrent bootstrap and duplicate grants | `proof:concurrentBootstrap` and `proof:concurrentDuplicateGrant` |
| Bounded lists, counts, fallback, slug allocation, and cleanup | Component invariant tests; large-limit and slug native proofs |
| Token stays out of scheduled arguments | `packages/example-backend/convex/example.test.ts` and delivery implementation |
| Stable-ID imports and safe retries | `imports.test.ts`, `migrationProof:run`, and actual Feedtwin source fixture |
| Preference translation and imported lifecycle | `migrationProof:runLifecycle` |
| Recovery after new writes | `migrationProof:runRecovery`, recovery receipts, and documented cutover procedure |
| Real consumer development integration | Full Feedtwin component tree on an isolated native backend; authenticated lifecycle checks |
| Pedalclass private-content preservation | Actual Pedalclass backend suite plus packed-component teammate privacy test |
| Legacy invitation policy | Read-only production inventory: two accepted invitations and no outstanding invitations |
| Package exports, generated declarations, and nested registration | CLI-generated declarations and packed consumer checks |
| Published dependency without patches | Registry convex-invite 0.1.1; no patchedDependencies entry |
| Supported Convex versions | Native packed checks at 1.43.0 and 1.45.0; peer range excludes 2.x |
| Metadata, licensing, contribution guidance, security reporting | package.json, LICENSE, NOTICE, CONTRIBUTING.md, SECURITY.md; GitHub private reporting enabled |
| Checkpoints and automated checks | Main-branch Git history and GitHub Actions checks |

## Boundary of this release

The component release does not migrate Feedtwin production. The verified production snapshot has three team users and no outstanding invitations. Before actual cutover, repeat the inventory, preserve source data, freeze both writers, apply host mappings and adapters, compare access, and resume one authority. Never use an old source snapshot to restore removed grants.

The separate permission engine remains deferred. Product-specific permissions, authentication, billing, and delivery stay in the host. Pedalclass sharing is a future product decision; current private content remains private.

## Final publication gates

- [x] Run all checks on the exact candidate version and commit.
- [x] Publish the candidate under a prerelease tag and verify registry integrity.
- [x] Install the published candidate in clean consumers and rerun the critical checks.
- [ ] Publish the first stable version and verify tags, integrity, documentation, and repository release.

## Published candidate

`1.0.0-rc.0` was published under `next` from commit `98324d2ac159f87de1b2754d790ca6d8b7a253bf`. [CI passed](https://github.com/clipinfit/convex-teams/actions/runs/34147777563). The registry integrity matches the local archive:

```text
sha512-6DdvXz3evNvOtIMXgF3xzFbLP93OamlUkOEntWWdMAro4MBcroP88qoaAMKuNIb+69vc7etnr724KM3Q0cz1bg==
```

Clean registry installations passed on Convex 1.43.0 and 1.45.0. Pedalclass passed all 24 backend tests. Feedtwin passed its source comparison and native authenticated lifecycle checks. Each command used `TEAMS_RELEASE_VERSION=1.0.0-rc.0`; no local teams archive supplied the runtime.
