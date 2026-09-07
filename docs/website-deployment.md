# Deploy the website

The public website is [convex-teams.vercel.app](https://convex-teams.vercel.app). The documentation is at [/docs](https://convex-teams.vercel.app/docs).

The website uses Next.js and Fumadocs in `apps/web`. The Vercel project is `convex-teams` in the `clipin` team. Its root directory is `apps/web`.

The project is connected to `clipinfit/convex-teams`. Push `main` to trigger a production website deployment. This does not publish an npm package or deploy the example Convex backend.

## Check the source

From the repository root:

```sh
bun install --frozen-lockfile
bun run lint
bun run check:links
bun run typecheck
bun run test
bun run build
bun run pack:check
```

Edit website content in `apps/web/content/docs`. The documentation search endpoint builds its index from those pages.

## Deploy from the CLI

Use an authenticated Vercel CLI session. From the repository root:

```sh
vercel link --yes --scope clipin --project convex-teams
vercel deploy --prod --scope clipin
```

The Vercel project must retain `apps/web` as its root directory. Keep access to workspace files outside that directory enabled.

`apps/web/vercel.json` pins Bun 1.4.0 for installation and builds. Vercel's default Bun 1.3.14 could not read this repository's version 2 lockfile. The configuration follows [Vercel's Bun version guidance](https://vercel.com/kb/guide/how-to-pin-a-specific-bun-version-for-vercel-builds).

`.vercelignore` excludes local environment files, Convex state, dependencies, and build output. `.vercel` project links remain local and ignored. Do not commit credentials.

## Check the deployment

Verify the production URL from the Vercel deployment result. Open the landing page and `/docs`. Search for `seat`, then open a result. Confirm that the release-status page still identifies the npm artifact as a notice-only package until a runtime is published.

Use `vercel inspect <deployment-url> --logs --scope clipin` to diagnose a build failure.
