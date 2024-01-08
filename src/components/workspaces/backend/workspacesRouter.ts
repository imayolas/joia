import { createTRPCRouter } from '@/server/trpc/trpc'
import { workspacesCancelInvite } from './procedures/workspacesCancelInvite'
import { workspacesCreateWorkspace } from './procedures/workspacesCreateWorkspace'
import { workspacesGetFirstWorkspaceForUser } from './procedures/workspacesGetFirstWorkspaceForUser'
import { workspacesGetWorkspace } from './procedures/workspacesGetWorkspace'
import { workspacesGetWorkspaceIdForChat } from './procedures/workspacesGetWorkspaceIdForChat'
import { workspacesGetWorkspaceIdForPost } from './procedures/workspacesGetWorkspaceIdForPost'
import { workspacesGetWorkspaceMembers } from './procedures/workspacesGetWorkspaceMembers'
import { workspacesGetWorkspaces } from './procedures/workspacesGetWorkspaces'
import { workspacesInviteUserToWorkspace } from './procedures/workspacesInviteUserToWorkspace'
import { workspacesRevokeWorkspaceMemberAccess } from './procedures/workspacesRevokeWorkspaceMemberAccess'
import { workspacesUpdateForOnboarding } from './procedures/workspacesUpdateForOnboarding'
import { workspacesUpdateWorkspace } from './procedures/workspacesUpdateWorkspace'

export const workspacesRouter = createTRPCRouter({
  getWorkspace: workspacesGetWorkspace,
  getFirstWorkspaceForUser: workspacesGetFirstWorkspaceForUser,
  getWorkspaces: workspacesGetWorkspaces,
  getWorkspaceIdForPost: workspacesGetWorkspaceIdForPost,
  getWorkspaceIdForChat: workspacesGetWorkspaceIdForChat,
  getWorkspaceMembers: workspacesGetWorkspaceMembers,
  createWorkspace: workspacesCreateWorkspace,
  updateWorkspace: workspacesUpdateWorkspace,
  updateWorkspaceForOnboarding: workspacesUpdateForOnboarding,
  inviteUserToWorkspace: workspacesInviteUserToWorkspace,
  cancelInviteToWorkspace: workspacesCancelInvite,
  revokeWorkspaceMemberAccess: workspacesRevokeWorkspaceMemberAccess,
})
