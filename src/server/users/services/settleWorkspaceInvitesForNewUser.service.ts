import { prismaAsTrx } from '@/server/lib/prismaAsTrx'
import { addUserToWorkspaceService } from '@/server/workspaces/services/addUserToWorkspace.service'
import type {
  PrismaClientOrTrxClient,
  PrismaTrxClient,
} from '@/shared/globalTypes'
import type { WorkspaceInvite } from '@prisma/client'
import { Promise } from 'bluebird'

export const settleWorkspaceInvitesForNewUserService = async (
  prisma: PrismaClientOrTrxClient,
  userId: string,
) => {
  return await prismaAsTrx(prisma, async (prisma) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
    })

    const invites = await prisma.workspaceInvite.findMany({
      where: {
        email: user.email!,
      },
    })

    await addUserToInvitedWorkspaces(prisma, userId, invites)
    await settleSharesFromInvitesToUsers(prisma, userId, invites)
    await cleanupInvitesForUser(prisma, invites)
  })
}

const addUserToInvitedWorkspaces = async (
  prisma: PrismaTrxClient,
  userId: string,
  invites: WorkspaceInvite[],
) => {
  const workspaceIds = invites.map((invite) => invite.workspaceId)

  await Promise.map(workspaceIds, async (workspaceId) => {
    await addUserToWorkspaceService(prisma, userId, workspaceId)
  })
}

const settleSharesFromInvitesToUsers = async (
  prisma: PrismaTrxClient,
  userId: string,
  invites: WorkspaceInvite[],
) => {
  await prisma.share.updateMany({
    where: {
      workspaceInviteId: {
        in: invites.map((invite) => invite.id),
      },
    },
    data: {
      userId,
      workspaceInviteId: null,
    },
  })
}

const cleanupInvitesForUser = async (
  prisma: PrismaTrxClient,
  invites: WorkspaceInvite[],
) => {
  const inviteIds = invites.map((invite) => invite.id)

  await prisma.workspaceInvite.deleteMany({
    where: {
      id: {
        in: inviteIds,
      },
    },
  })
}
