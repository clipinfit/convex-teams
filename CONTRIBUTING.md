# Contributing

Use Node.js 22 or later and Bun 1.4.0. Install dependencies with `bun install --frozen-lockfile`.

The component source is in `packages/convex-teams`. The runnable host is in `packages/example-backend`. Website documentation is in `apps/web/content/docs`.

Before submitting a change, run:

```sh
bun run typecheck
bun run lint
bun run check:links
bun run test
bun run build
bun run pack:check
```

For component or dependency changes, also run `bun run pack:smoke`. Regenerate component declarations with `bun run codegen`. Build the package before deploying the example backend so its SDK entry points are current. Never edit generated declarations manually.

Keep authentication, product permissions, billing, and delivery in the host. Preserve the owner and membership invariants. Add transaction tests for changes to grants, ownership, invitations, or cleanup. Document breaking changes and migration steps. Update both changelogs and the public documentation with API changes.

Consumer rehearsal scripts require the corresponding local consumer repository. They copy its current package source into a temporary workspace and do not change the original. Production inventory is a separate read-only maintainer command. Do not include credentials, personal data, or invitation tokens in commits or issue reports.

Use a focused pull request with the problem, changed behavior, and validation results. Report vulnerabilities through the private channel in SECURITY.md.
