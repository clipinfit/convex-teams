import { register } from "convex-teams/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api.js";
import schema from "./schema.js";

test("Feedtwin fixture preserves IDs, billing references, ownership and project-only access across retries", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  expect(await t.action(internal.migrationProof.run, {})).toEqual({
    teams: 2,
    repeatable: true,
    accessPreserved: true,
  });
  expect(
    await t.run((ctx) => ctx.db.query("migrationMappings").collect()),
  ).toHaveLength(2);
  expect(
    await t.run((ctx) => ctx.db.query("migrationSources").collect()),
  ).toHaveLength(2);
});
