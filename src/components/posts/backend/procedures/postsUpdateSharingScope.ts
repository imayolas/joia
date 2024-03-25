import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { updateShareService } from '@/server/shares/services/updateShare.service'
import { protectedProcedure } from '@/server/trpc/trpc'
import { ShareScope } from '@/shared/globalTypes'
import { z } from 'zod'

const zInput = z.object({
  shareId: z.string(),
  scope: z.nativeEnum(ShareScope),
})

export const postsUpdateSharingScope = protectedProcedure
  .input(zInput)
  .mutation(async ({ ctx, input }) => {
    const invitingUserId = ctx.session.user.id
    const share = await ctx.prisma.share.findUniqueOrThrow({
      where: {
        id: input.shareId,
      },
      include: {
        post: {
          select: {
            workspaceId: true,
          },
        },
      },
    })

    const workspaceId = share.post.workspaceId

    const context = await createUserOnWorkspaceContext(
      ctx.prisma,
      workspaceId,
      invitingUserId,
    )
    return await updateShareService(ctx.prisma, context, {
      email: input.email,
      postId: input.postId,
    })
  })
