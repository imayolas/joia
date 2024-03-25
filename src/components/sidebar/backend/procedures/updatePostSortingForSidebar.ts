import {
  createUserOnWorkspaceContext,
  type UserOnWorkspaceContext,
} from '@/server/auth/userOnWorkspaceContext'
import { scopePostByWorkspace } from '@/server/posts/postUtils'
import { protectedProcedure } from '@/server/trpc/trpc'
import type { PrismaClientOrTrxClient } from '@/shared/globalTypes'
import { uniq } from 'underscore'
import { z } from 'zod'

const zInput = z.object({
  workspaceId: z.string(),
  sortedPosts: z.string().array(),
  // postId: z.string(),
  // previousPostId: z.string().nullable(),
})

export const updatePostSortingForSidebar = protectedProcedure
  .input(zInput)
  .mutation(async ({ ctx, input }) => {
    // const { workspaceId, sortedPosts, postId, previousPostId } = input
    const { workspaceId, sortedPosts } = input
    const userId = ctx.session.user.id

    const context = await createUserOnWorkspaceContext(
      ctx.prisma,
      workspaceId,
      userId,
    )

    await doLegacyUpdate(ctx.prisma, context, sortedPosts)
    // await updatePostSorting(ctx.prisma, userId, postId, previousPostId)
  })

const doLegacyUpdate = async (
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  sortedPosts: string[],
) => {
  const { userId, workspaceId } = uowContext
  const existingPosts = await prisma.post.findMany({
    select: {
      id: true,
    },
    where: scopePostByWorkspace(
      {
        id: {
          in: sortedPosts,
        },
      },
      workspaceId,
    ),
  })

  const existingPostIds = new Set(existingPosts.map((post) => post.id))

  const sortedExistingPosts = uniq(
    sortedPosts.filter((postId) => existingPostIds.has(postId)),
  )

  await prisma.postSort.upsert({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    update: {
      sortedPosts: sortedExistingPosts,
    },
    create: {
      userId,
      workspaceId,
      sortedPosts: sortedExistingPosts,
    },
  })
}
