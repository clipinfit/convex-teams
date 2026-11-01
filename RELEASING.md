# Releasing

## Verify the package

Run these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run check:links
bun run test
bun run build
bun run pack:check
bun run pack:smoke
```

The smoke check installs the package archive in a temporary npm project. It checks exported types, test registration, component mounting, invitation pagination, and acceptance rollback on a local Convex backend. It requires Node.js, npm, and access to download the Convex backend. The temporary project is retained for inspection.

Review the package contents and changelog. Confirm that CI passes for the commit you intend to publish. Keep credentials, personal data, invitation tokens, and local build output out of the package.

## Publish to npm

1. Update the version in `packages/convex-teams/package.json` and both changelogs. Update the lockfile with `bun install --lockfile-only`.
2. Keep the package README, licence, and notices synchronized with the root copies.
3. Run the verification commands above. Commit the changes and wait for CI to pass.
4. Run `npm whoami` with an account that can publish under `@clipin`.
5. In `packages/convex-teams`, run `npm pack --dry-run` and inspect the file list.
6. Run `npm publish --access public` and complete npm authentication.
7. Install the exact version in a fresh Convex application. Verify the client, component configuration, generated types, and test helper.
8. Tag the source commit as `v<VERSION>` and create the GitHub release with its changelog entry.

The repository root is private. Publish only from `packages/convex-teams`. The `prepublishOnly` check rejects workspace dependency patches and uncommitted changes.

Use a major version for incompatible API or documented authorization changes. Use a minor version for compatible additions and a patch version for compatible fixes. Each published artifact requires a new version.

## Deploy the website

Use `apps/web` as the project root. Enable access to workspace files outside that directory. Install with `bun install --frozen-lockfile` and build with `bun run build`.

The website requires no backend credentials. Verify navigation, search, and installation examples after deployment.
