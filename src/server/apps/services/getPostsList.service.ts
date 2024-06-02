import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { ShareScope, type PrismaClientOrTrxClient } from '@/shared/globalTypes'
import type { App, AppConfigVersion, Prisma } from '@prisma/client'
import { omit, sortBy } from 'underscore'
import { scopePostByWorkspace } from '../appUtils'

interface GetPostsListServicePayload {
  includeLatestConfig?: boolean
}

// Overload signatures
export function getPostsListService(
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload: { includeLatestConfig: true },
): Promise<(App & { latestConfig: AppConfigVersion })[]>

export function getPostsListService(
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload?: { includeLatestConfig?: false },
): Promise<App[]>

export async function getPostsListService(
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload?: GetPostsListServicePayload,
) {
  const { includeLatestConfig } = payload ?? {}

  const whereClauseForPrivateScope = {
    userId: uowContext.userId,
    shares: {
      some: {
        scope: ShareScope.Private,
      },
    },
  }

  const whereClauseForUserScope = {
    shares: {
      some: {
        scope: ShareScope.User,
        shareTargets: {
          some: {
            userId: uowContext.userId,
          },
        },
      },
    },
  }

  const whereClauseForEverybodyScope = {
    shares: {
      some: {
        scope: ShareScope.Everybody,
      },
    },
  }

  const [postsWithScopePrivate, postsWithScopeUser, postsWithScopeEverybody] =
    await Promise.all([
      genericPostFetch(
        prisma,
        uowContext.workspaceId,
        whereClauseForPrivateScope,
        !!includeLatestConfig,
      ),
      await genericPostFetch(
        prisma,
        uowContext.workspaceId,
        whereClauseForUserScope,
        !!includeLatestConfig,
      ),
      await genericPostFetch(
        prisma,
        uowContext.workspaceId,
        whereClauseForEverybodyScope,
        !!includeLatestConfig,
      ),
    ])

  return sortBy(
    [
      ...postsWithScopePrivate,
      ...postsWithScopeUser,
      ...postsWithScopeEverybody,
    ],
    (app) => -app.createdAt,
  )
}

const genericPostFetch = async (
  prisma: PrismaClientOrTrxClient,
  workspaceId: string,
  whereClause: Prisma.AppWhereInput,
  includeLatestConfig: boolean,
) => {
  const where = scopePostByWorkspace(
    {
      isDefault: false,
      ...whereClause,
    },
    workspaceId,
  )

  if (includeLatestConfig) {
    const apps = await prisma.app.findMany({
      where,
      include: {
        appConfigVersions: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    })

    return apps.map((app) => {
      return {
        ...app,
        ...omit(app, 'appConfigVersions'),
        latestConfig: app.appConfigVersions[0],
      }
    })
  }

  return await prisma.app.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
  })
}
