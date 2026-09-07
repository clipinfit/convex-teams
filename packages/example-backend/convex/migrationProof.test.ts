import { register } from "convex-teams/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { components, internal } from "./_generated/api.js";
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

test("imported preferences and lifecycle preserve fallback without promoting project-only guests", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  await t.action(internal.migrationProof.runLifecycle, {});
  const preferences = await t.run((ctx) =>
    ctx.db.query("migrationPreferences").collect(),
  );
  expect(preferences).toHaveLength(2);
  expect(preferences.every((preference) => preference.applied)).toBe(true);
  const memberPreference = preferences.find((preference) =>
    preference.userId.startsWith("shared-"),
  );
  if (!memberPreference) throw new Error("Missing member preference.");
  const source = await t.run((ctx) =>
    ctx.db.get(memberPreference.activeSourceId),
  );
  expect(
    source?.members.some((member) => member.userId === memberPreference.userId),
  ).toBe(true);
  // The retained source still grants access removed after cutover. It is not safe
  // to switch back to it without reconciling the destination changes.
  await expect(
    t.query(internal.migrationProof.verify, {
      sourceId: memberPreference.activeSourceId,
    }),
  ).rejects.toThrow("Membership count changed");
  const fallback = await t.query(components.teams.teams.getActiveTeam, {
    userId: memberPreference.userId,
  });
  const remaining = await t.run((ctx) =>
    ctx.db.get(memberPreference.defaultSourceId),
  );
  expect(fallback?.teamPublicId).toBe(remaining?.teamPublicId);
});

test("preference retries preserve later user selection and missing mappings abort migration", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  const [firstId, secondId] = await t.mutation(
    internal.migrationProof.setup,
    {},
  );
  if (!firstId || !secondId) throw new Error("Missing fixture sources.");
  const preferences = await t.mutation(
    internal.migrationProof.setupPreferences,
    { firstId, secondId },
  );
  await expect(
    t.mutation(internal.migrationProof.migratePreferences, {
      preferenceId: preferences.memberPreferenceId,
    }),
  ).rejects.toThrow("completed team mappings");
  expect(
    (await t.run((ctx) => ctx.db.get(preferences.memberPreferenceId)))?.applied,
  ).toBe(false);
  await t.mutation(internal.migrationProof.migrate, { sourceId: firstId });
  await t.mutation(internal.migrationProof.migrate, { sourceId: secondId });
  await t.mutation(internal.migrationProof.migratePreferences, {
    preferenceId: preferences.memberPreferenceId,
  });
  const preference = await t.run((ctx) =>
    ctx.db.get(preferences.memberPreferenceId),
  );
  const second = await t.run((ctx) => ctx.db.get(secondId));
  if (!preference || !second) throw new Error("Missing fixture records.");
  await t.mutation(components.teams.teams.setActiveTeam, {
    userId: preference.userId,
    teamSlug: second.teamSlug,
  });
  await t.mutation(internal.migrationProof.migratePreferences, {
    preferenceId: preferences.memberPreferenceId,
  });
  expect(
    (
      await t.query(components.teams.teams.getActiveTeam, {
        userId: preference.userId,
      })
    )?.teamPublicId,
  ).toBe(second.teamPublicId);
});
