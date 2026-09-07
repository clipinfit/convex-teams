import { register } from "convex-teams/test";
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, components, internal } from "./_generated/api.js";
import schema from "./schema.js";

function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  return t;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("the host authenticates identity across the teams and invite component tree", async () => {
  const t = setup();
  const fixture = await t.mutation(internal.proof.setup, {});
  await expect(
    t.mutation(api.teams.accept, { token: fixture.token }),
  ).rejects.toThrow("verified email");
  await expect(
    t
      .withIdentity({
        subject: "invitee",
        email: "invitee@example.com",
        emailVerified: false,
      })
      .mutation(api.teams.accept, { token: fixture.token }),
  ).rejects.toThrow("verified email");
  const authenticated = t.withIdentity({
    subject: "invitee",
    email: "invitee@example.com",
    emailVerified: true,
  });
  await authenticated.mutation(api.teams.accept, { token: fixture.token });
  const teams = await authenticated.query(api.teams.list, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(teams.page.map((team) => team.teamId)).toEqual([fixture.teamId]);
});

test("delivery issues a token inside the action and schedules no token arguments", async () => {
  const t = setup();
  const owner = t.withIdentity({ subject: "owner" });
  const team = await owner.mutation(api.teams.create, { name: "Delivery" });
  vi.stubEnv("INVITATION_DELIVERY_URL", "https://mail.example.test/send");
  const send = vi.fn(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", send);
  expect(
    await owner.action(api.delivery.send, {
      teamSlug: team.teamSlug,
      email: "new@example.com",
    }),
  ).toEqual({ state: "sent" });
  expect(send).toHaveBeenCalledTimes(1);
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(jobs).toHaveLength(0);
  const invitations = await t.query(components.teams.invites.listPending, {
    userId: "owner",
    teamSlug: team.teamSlug,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(invitations.page[0]?.deliveryState).toBe("sent");
});

test("delivery provider failures record a safe state", async () => {
  const t = setup();
  const owner = t.withIdentity({ subject: "owner" });
  const team = await owner.mutation(api.teams.create, { name: "Delivery" });
  vi.stubEnv("INVITATION_DELIVERY_URL", "https://mail.example.test/send");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("provider secret");
    }),
  );
  expect(
    await owner.action(api.delivery.send, {
      teamSlug: team.teamSlug,
      email: "new@example.com",
    }),
  ).toEqual({ state: "failed" });
  const invitations = await t.query(components.teams.invites.listPending, {
    userId: "owner",
    teamSlug: team.teamSlug,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(invitations.page[0]?.deliveryState).toBe("failed");
});

test("concurrent bootstrap returns one personal workspace", async () => {
  const t = setup();
  expect(await t.action(internal.proof.concurrentBootstrap, {})).toEqual({
    personalTeamCount: 1,
    sameTeamId: true,
  });
});

test("concurrent same-user grants return one membership", async () => {
  const t = setup();
  expect(await t.action(internal.proof.concurrentDuplicateGrant, {})).toEqual({
    memberCount: 2,
    sameMembershipId: true,
  });
});
