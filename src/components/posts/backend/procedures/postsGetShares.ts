import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { getPostSharesService } from '@/server/shares/services/getPostShares.service'
import { protectedProcedure } from '@/server/trpc/trpc'
import { z } from 'zod'

const zInput = z.object({
  postId: z.string(),
})

const zOutput = z.array(
  z.object({
    id: z.string(),
    postId: z.string(),
    scope: z.string(),
    email: z.string(),
    accessLevel: z.string(),
    userId: z.string().nullable(),
    workspaceInviteId: z.string().nullable(),
  }),
)

export const postsGetShares = protectedProcedure
  .input(zInput)
  .output(zOutput)
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const { postId } = input

    const post = await ctx.prisma.post.findFirstOrThrow({
      where: {
        id: postId,
        userId,
      },
    })

    const context = await createUserOnWorkspaceContext(
      ctx.prisma,
      post.workspaceId,
      userId,
    )

    // AcccessLevel .View is ok here because we're only checking if the user has access to the post
    // Incresing the level would fail because the frontend needs to always see the user's permissions
    // await new PermissionsVerifier(ctx.prisma).callOrThrowTrpcError(
    //   PermissionAction.View,
    //   userId,
    //   input.postId,
    // )

    const shares = await getPostSharesService(ctx.prisma, context, { postId })

    return shares.map((share) => {
      const email = share.user?.email ?? share.workspaceInvite?.email

      return {
        id: share.id,
        postId: share.postId,
        scope: share.scope,
        email: email ?? '',
        accessLevel: share.accessLevel,
        userId: share.userId,
        workspaceInviteId: share.workspaceInviteId,
      }
    })
  })
