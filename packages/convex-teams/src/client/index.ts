import type {
  FunctionArgs,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  PaginationOptions,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type MutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
type ActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runMutation">;

/** Host code authenticates actors and supplies current seat policy on every grant. */
export class TeamsClient {
  constructor(public readonly component: ComponentApi) {}

  /** Trusted migration only. Never expose as an unauthenticated host endpoint. */
  importTeam(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["imports"]["begin"]>,
  ) {
    return ctx.runMutation(this.component.imports.begin, args);
  }
  importMembers(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["imports"]["members"]>,
  ) {
    return ctx.runMutation(this.component.imports.members, args);
  }
  finishImport(ctx: MutationCtx, teamPublicId: string) {
    return ctx.runMutation(this.component.imports.finish, { teamPublicId });
  }

  listTeams(ctx: QueryCtx, userId: string, paginationOpts: PaginationOptions) {
    return ctx.runQuery(this.component.teams.listForUser, {
      userId,
      paginationOpts,
    });
  }
  getTeamBySlug(ctx: QueryCtx, userId: string, teamSlug: string) {
    return ctx.runQuery(this.component.teams.getBySlug, { userId, teamSlug });
  }
  getActiveTeam(ctx: QueryCtx, userId: string) {
    return ctx.runQuery(this.component.teams.getActiveTeam, { userId });
  }
  getDefaultTeam(ctx: QueryCtx, userId: string) {
    return ctx.runQuery(this.component.teams.getDefaultTeam, { userId });
  }
  listMembers(
    ctx: QueryCtx,
    userId: string,
    teamSlug: string,
    paginationOpts: PaginationOptions,
  ) {
    return ctx.runQuery(this.component.teams.listMembers, {
      userId,
      teamSlug,
      paginationOpts,
    });
  }
  listPendingInvites(
    ctx: QueryCtx,
    userId: string,
    teamSlug: string,
    paginationOpts: PaginationOptions,
  ) {
    return ctx.runQuery(this.component.invites.listPending, {
      userId,
      teamSlug,
      paginationOpts,
    });
  }
  ensurePersonalTeam(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["teams"]["ensurePersonalTeam"]>,
  ) {
    return ctx.runMutation(this.component.teams.ensurePersonalTeam, args);
  }
  prepareMembershipCount(ctx: MutationCtx, userId: string, teamSlug: string) {
    return ctx.runMutation(this.component.teams.prepareMembershipCount, {
      userId,
      teamSlug,
    });
  }
  createTeam(ctx: MutationCtx, userId: string, teamName: string) {
    return ctx.runMutation(this.component.teams.createTeam, {
      userId,
      teamName,
    });
  }
  setActiveTeam(ctx: MutationCtx, userId: string, teamSlug: string) {
    return ctx.runMutation(this.component.teams.setActiveTeam, {
      userId,
      teamSlug,
    });
  }
  setDefaultTeam(ctx: MutationCtx, userId: string, teamId: string) {
    return ctx.runMutation(this.component.teams.setDefaultTeam, {
      userId,
      teamId,
    });
  }
  updateTeamProfile(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["teams"]["updateTeamProfile"]>,
  ) {
    return ctx.runMutation(this.component.teams.updateTeamProfile, args);
  }
  removeMember(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["teams"]["removeMember"]>,
  ) {
    return ctx.runMutation(this.component.teams.removeMember, args);
  }
  updateMemberRole(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["teams"]["updateMemberRole"]>,
  ) {
    return ctx.runMutation(this.component.teams.updateMemberRole, args);
  }
  transferOwnership(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["teams"]["transferOwnership"]>,
  ) {
    return ctx.runMutation(this.component.teams.transferOwnership, args);
  }
  /** Trusted provisioning only. Do not expose this as an unauthenticated endpoint. */
  addMember(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["teams"]["addMemberInternal"]>,
  ) {
    return ctx.runMutation(this.component.teams.addMemberInternal, args);
  }
  leaveTeam(ctx: MutationCtx, userId: string, teamSlug: string) {
    return ctx.runMutation(this.component.teams.leaveTeam, {
      userId,
      teamSlug,
    });
  }
  deleteTeam(ctx: MutationCtx, userId: string, teamPublicId: string) {
    return ctx.runMutation(this.component.teams.deleteTeam, {
      userId,
      teamPublicId,
    });
  }
  /** Call from a host delivery action through an internal host mutation. Never schedule the token. */
  createInvite(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["invites"]["createInvite"]>,
  ) {
    return ctx.runMutation(this.component.invites.createInvite, args);
  }
  revokeInvite(ctx: MutationCtx, userId: string, inviteId: string) {
    return ctx.runMutation(this.component.invites.revokeInvite, {
      userId,
      inviteId,
    });
  }
  resendInvite(ctx: MutationCtx, userId: string, inviteId: string) {
    return ctx.runMutation(this.component.invites.resendInvite, {
      userId,
      inviteId,
    });
  }
  acceptInvite(
    ctx: MutationCtx,
    args: FunctionArgs<ComponentApi["invites"]["acceptInvite"]>,
  ) {
    return ctx.runMutation(this.component.invites.acceptInvite, args);
  }
  recordDeliveryAttempt(
    ctx: ActionCtx,
    args: FunctionArgs<ComponentApi["invites"]["recordDeliveryAttempt"]>,
  ) {
    return ctx.runMutation(this.component.invites.recordDeliveryAttempt, args);
  }
  pruneInvitations(ctx: MutationCtx, limit?: number) {
    return ctx.runMutation(this.component.invites.prune, { limit });
  }
}

export type * from "./types.js";
export type { ComponentApi };
