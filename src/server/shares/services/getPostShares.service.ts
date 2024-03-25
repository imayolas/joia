import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { scopePostByWorkspace } from '@/server/posts/postUtils'
import { type PrismaClientOrTrxClient } from '@/shared/globalTypes'

interface GetPostSharesPayload {
  postId: string
}

export const getPostSharesService = async (
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload: GetPostSharesPayload,
) => {
  const { workspaceId } = uowContext
  const { postId } = payload

  const sharedWithUsers = await prisma.share.findMany({
    where: {
      post: scopePostByWorkspace(
        {
          id: postId,
        },
        workspaceId,
      ),
    },
    include: {
      user: true,
      workspaceInvite: true,
    },
  })

  return sharedWithUsers
}
