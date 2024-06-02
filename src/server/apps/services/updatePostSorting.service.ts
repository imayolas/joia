import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prismaAsTrx } from '@/server/lib/prismaAsTrx'
import type {
  PrismaClientOrTrxClient,
  PrismaTrxClient,
} from '@/shared/globalTypes'
import { scopePostByWorkspace } from '../appUtils'

export const updatePostSortingService = async (
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  appIdToPushToPosition1: string,
) => {
  const { workspaceId, userId } = uowContext

  return prismaAsTrx(prisma, async (prisma) => {
    await prisma.app.findFirstOrThrow({
      where: scopePostByWorkspace(
        {
          id: appIdToPushToPosition1,
        },
        workspaceId,
      ),
    })

    const existingPostsWithPosition = await prisma.appsOnUsers.findFirst({
      where: {
        userId,
        appId: appIdToPushToPosition1,
        position: {
          not: null,
        },
      },
      select: {
        appId: true,
      },
    })

    if (existingPostsWithPosition) {
      return
    }

    await nullifyPostsWithPositionGte5(prisma, userId)
    await updateExistingPositions(prisma, userId)
    await pushPostToPosition1(prisma, userId, appIdToPushToPosition1)
  })
}

const nullifyPostsWithPositionGte5 = async (
  prisma: PrismaTrxClient,
  userId: string,
) => {
  await prisma.appsOnUsers.updateMany({
    where: {
      userId,
      position: {
        gte: 5,
      },
    },
    data: {
      position: null,
    },
  })
}

const updateExistingPositions = async (
  prisma: PrismaTrxClient,
  userId: string,
) => {
  await prisma.appsOnUsers.updateMany({
    where: {
      userId,
      position: {
        not: null,
      },
    },
    data: {
      position: {
        increment: 1,
      },
    },
  })
}

const pushPostToPosition1 = async (
  prisma: PrismaTrxClient,
  userId: string,
  appId: string,
) => {
  await prisma.appsOnUsers.upsert({
    where: {
      userId_appId: {
        appId,
        userId,
      },
    },
    update: {
      position: 1,
    },
    create: {
      appId,
      userId,
      position: 1,
    },
  })
}
