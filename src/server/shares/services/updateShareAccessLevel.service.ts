import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prismaAsTrx } from '@/server/lib/prismaAsTrx'
import { WorkspaceInviteSources } from '@/server/workspaces/workspaceTypes'
import {
  UserAccessLevelActions,
  type PrismaClientOrTrxClient,
  type PrismaTrxClient,
} from '@/shared/globalTypes'
import { scopeShareByWorkspace } from '../shareUtils'

interface UpdateShareAccessLevelPayload {
  shareId: string
  accessLevel: UserAccessLevelActions
}

export const updateShareAccessLevelService = async (
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload: UpdateShareAccessLevelPayload,
) => {
  const { workspaceId } = uowContext
  const { shareId, accessLevel } = payload

  return await prismaAsTrx(prisma, async (prisma) => {
    // await new PermissionsVerifier(ctx.prisma).callOrThrowTrpcError(
    //   PermissionAction.Share,
    //   userId,
    //   share.postId,
    // )

    if (accessLevel === UserAccessLevelActions.Remove) {
      return await deleteShareAccessLevel(prisma, workspaceId, shareId)
    }

    return await updateShareAccessLevel(
      prisma,
      workspaceId,
      shareId,
      accessLevel,
    )
  })
}

const deleteShareAccessLevel = async (
  prisma: PrismaTrxClient,
  workspaceId: string,
  shareId: string,
) => {
  const share = await prisma.share.findFirstOrThrow({
    where: scopeShareByWorkspace(
      {
        id: shareId,
      },
      workspaceId,
    ),
  })

  // Share is linked to an invite
  if (share.workspaceInviteId) {
    const [workspaceInvite, countOfOtherSharesWithSameInvite] =
      await Promise.all([
        await prisma.workspaceInvite.findFirstOrThrow({
          where: {
            id: share.workspaceInviteId,
          },
        }),
        await prisma.share.count({
          where: {
            workspaceInviteId: share.workspaceInviteId,
            id: {
              not: shareId,
            },
          },
        }),
      ])

    if (workspaceInvite.source === (WorkspaceInviteSources.Share as string)) {
      if (countOfOtherSharesWithSameInvite === 0) {
        await prisma.workspaceInvite.delete({
          where: {
            id: share.workspaceInviteId,
          },
        })
        // Early return as the deletion above cascades to the share
        return
      }
    }
  }

  await prisma.share.delete({
    where: {
      id: shareId,
    },
  })
}

const updateShareAccessLevel = async (
  prisma: PrismaTrxClient,
  workspaceId: string,
  shareId: string,
  accessLevel: UserAccessLevelActions,
) => {
  await prisma.share.findFirstOrThrow({
    where: scopeShareByWorkspace(
      {
        id: shareId,
      },
      workspaceId,
    ),
  })

  return await prisma.share.update({
    where: {
      id: shareId,
    },
    data: {
      accessLevel,
    },
  })
}
