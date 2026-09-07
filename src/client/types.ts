import type { FunctionReturnType } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

export type Team = FunctionReturnType<
  ComponentApi["teams"]["listForUser"]
>[number];
export type TeamRole = Team["role"];
export type TeamAccess = Team["access"];
export type TeamStatus = Team["status"];
export type TeamRef = NonNullable<
  FunctionReturnType<ComponentApi["teams"]["getDefaultTeam"]>
>;
export type BootstrapResult = FunctionReturnType<
  ComponentApi["teams"]["ensurePersonalTeam"]
>;
export type TeamMemberList = NonNullable<
  FunctionReturnType<ComponentApi["teams"]["listMembers"]>
>;
export type TeamMember = TeamMemberList["page"][number];
export type TeamInvite = FunctionReturnType<
  ComponentApi["invites"]["listPending"]
>["page"][number];
export type InviteStatus = TeamInvite["state"];
export type CreateInviteResult = FunctionReturnType<
  ComponentApi["invites"]["createInvite"]
>;
export type InvitableRole = CreateInviteResult["role"];
export type AcceptInviteResult = FunctionReturnType<
  ComponentApi["invites"]["acceptInvite"]
>;
