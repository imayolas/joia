import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { performShareService } from '@/server/shares/services/performShare.service'
import { protectedProcedure } from '@/server/trpc/trpc'
import { z } from 'zod'

const zInput = z.object({
  postId: z.string(),
  email: z.string().email(),
})

export const postsSharePerform = protectedProcedure
  .input(zInput)
  .mutation(async ({ ctx, input }) => {
    const invitingUserId = ctx.session.user.id
    const post = await ctx.prisma.post.findUniqueOrThrow({
      where: {
        id: input.postId,
      },
    })
    const context = await createUserOnWorkspaceContext(
      ctx.prisma,
      post.workspaceId,
      invitingUserId,
    )
    return await performShareService(ctx.prisma, context, {
      email: input.email,
      postId: input.postId,
    })
  })
