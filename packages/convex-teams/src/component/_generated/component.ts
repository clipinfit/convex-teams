/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    imports: {
      begin: FunctionReference<
        "mutation",
        "internal",
        {
          expectedMemberCount: number;
          ownerUserId: string;
          personal: boolean;
          teamName: string;
          teamPublicId: string;
          teamSlug: string;
        },
        { status: "open" | "complete"; teamId: string },
        Name
      >;
      finish: FunctionReference<
        "mutation",
        "internal",
        { teamPublicId: string },
        string,
        Name
      >;
      members: FunctionReference<
        "mutation",
        "internal",
        {
          members: Array<{
            role: "owner" | "admin" | "member";
            userId: string;
          }>;
          teamPublicId: string;
        },
        null,
        Name
      >;
    };
    invites: {
      acceptInvite: FunctionReference<
        "mutation",
        "internal",
        { email: string; seatLimit?: number; token: string; userId: string },
        {
          role: "owner" | "admin" | "member";
          teamId: string;
          teamPublicId: string;
          teamSlug: string;
        },
        Name
      >;
      createInvite: FunctionReference<
        "mutation",
        "internal",
        {
          email: string;
          role: "admin" | "member";
          teamSlug: string;
          userId: string;
        },
        {
          email: string;
          expiresAt: number;
          inviteId: string;
          role: "admin" | "member";
          token: string;
        },
        Name
      >;
      listPending: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          teamSlug: string;
          userId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            deliveryState: string;
            email: string;
            expiresAt: number;
            inviteId: string;
            role: "admin" | "member";
            state: string;
          }>;
        },
        Name
      >;
      prune: FunctionReference<
        "mutation",
        "internal",
        { limit?: number },
        { deleted: number; expired: number },
        Name
      >;
      recordDeliveryAttempt: FunctionReference<
        "mutation",
        "internal",
        {
          inviteId: string;
          state: "queued" | "sent" | "failed";
          transport: string;
        },
        null,
        Name
      >;
      resendInvite: FunctionReference<
        "mutation",
        "internal",
        { inviteId: string; userId: string },
        {
          email: string;
          expiresAt: number;
          inviteId: string;
          role: "admin" | "member";
          token: string;
        },
        Name
      >;
      revokeInvite: FunctionReference<
        "mutation",
        "internal",
        { inviteId: string; userId: string },
        { ok: boolean },
        Name
      >;
    };
    teams: {
      addMemberInternal: FunctionReference<
        "mutation",
        "internal",
        {
          role: "admin" | "member";
          seatLimit?: number;
          teamId: string;
          userId: string;
        },
        { membershipId: string },
        Name
      >;
      createTeam: FunctionReference<
        "mutation",
        "internal",
        { teamName: string; userId: string },
        {
          teamId: string;
          teamName: string;
          teamPublicId: string;
          teamSlug: string;
        },
        Name
      >;
      deleteTeam: FunctionReference<
        "mutation",
        "internal",
        { teamPublicId: string; userId: string },
        {
          ok: boolean;
          redirectTeamPublicId: string | null;
          redirectTeamSlug: string | null;
        },
        Name
      >;
      ensurePersonalTeam: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          firstName?: string;
          lastName?: string;
          name?: string;
          userId: string;
          username?: string;
        },
        {
          activeTeamId: string;
          activeTeamPublicId: string;
          activeTeamSlug: string;
          defaultTeamId: string;
          defaultTeamPublicId: string;
          defaultTeamSlug: string;
        },
        Name
      >;
      getActiveTeam: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          name: string;
          role: "owner" | "admin" | "member";
          slug: string;
          teamId: string;
          teamPublicId: string;
        } | null,
        Name
      >;
      getBySlug: FunctionReference<
        "query",
        "internal",
        { teamSlug: string; userId: string },
        {
          access: {
            canManage: boolean;
            canManageMembers: boolean;
            canRead: boolean;
            canWrite: boolean;
          };
          isActiveTeam: boolean;
          isDefaultTeam: boolean;
          name: string;
          role: "owner" | "admin" | "member";
          slug: string;
          status: "active" | "pending_payment" | "deleted";
          teamId: string;
          teamPublicId: string;
        } | null,
        Name
      >;
      getDefaultTeam: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          name: string;
          slug: string;
          teamId: string;
          teamPublicId: string;
        } | null,
        Name
      >;
      getTeamState: FunctionReference<
        "query",
        "internal",
        { teamPublicId: string },
        null | {
          ownerUserId: string;
          status: "active" | "pending_payment";
          teamId: string;
          teamName: string;
          teamPublicId: string;
          teamSlug: string;
        },
        Name
      >;
      leaveTeam: FunctionReference<
        "mutation",
        "internal",
        { teamSlug: string; userId: string },
        {
          leftTeamPublicId: string;
          ok: boolean;
          redirectTeamPublicId: string | null;
          redirectTeamSlug: string | null;
        },
        Name
      >;
      listForUser: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          userId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            access: {
              canManage: boolean;
              canManageMembers: boolean;
              canRead: boolean;
              canWrite: boolean;
            };
            isActiveTeam: boolean;
            isDefaultTeam: boolean;
            name: string;
            role: "owner" | "admin" | "member";
            slug: string;
            status: "active" | "pending_payment" | "deleted";
            teamId: string;
            teamPublicId: string;
          }>;
        },
        Name
      >;
      listMembers: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          teamSlug: string;
          userId: string;
        },
        null | {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            membershipId: string;
            role: "owner" | "admin" | "member";
            userId: string;
          }>;
        },
        Name
      >;
      prepareMembershipCount: FunctionReference<
        "mutation",
        "internal",
        { teamSlug: string; userId: string },
        "ready" | "counting",
        Name
      >;
      removeMember: FunctionReference<
        "mutation",
        "internal",
        { targetUserId: string; teamSlug: string; userId: string },
        { ok: boolean },
        Name
      >;
      setActiveTeam: FunctionReference<
        "mutation",
        "internal",
        { teamSlug: string; userId: string },
        {
          role: "owner" | "admin" | "member";
          slug: string;
          teamId: string;
          teamPublicId: string;
        },
        Name
      >;
      setDefaultTeam: FunctionReference<
        "mutation",
        "internal",
        { teamId: string; userId: string },
        { ok: boolean },
        Name
      >;
      transferOwnership: FunctionReference<
        "mutation",
        "internal",
        { targetUserId: string; teamSlug: string; userId: string },
        { ok: boolean },
        Name
      >;
      updateMemberRole: FunctionReference<
        "mutation",
        "internal",
        {
          role: "admin" | "member";
          targetUserId: string;
          teamSlug: string;
          userId: string;
        },
        { ok: boolean; role: string; updated: boolean },
        Name
      >;
      updateTeamProfile: FunctionReference<
        "mutation",
        "internal",
        { name: string; slug?: string; teamSlug: string; userId: string },
        { name: string; slug: string; teamPublicId: string; updated: boolean },
        Name
      >;
    };
  };
