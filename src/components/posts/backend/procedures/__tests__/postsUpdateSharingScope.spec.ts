import { prisma } from '@/server/db'
import { updateShareService } from '@/server/shares/services/updateShare.service'
import { PostFactory } from '@/server/testing/factories/PostFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { trpcContextSetupHelper } from '@/server/testing/trpcContextSetupHelper'
import { ShareScope } from '@/shared/globalTypes'
import type { Post, Share, User, Workspace } from '@prisma/client'

jest.mock('@/server/shares/services/updateShare.service')

const subject = async (userId: string, shareId: string, scope: ShareScope) => {
  const { caller } = trpcContextSetupHelper(prisma, userId)
  return await caller.posts.updateSharingScope({ shareId, scope })
}

describe('postsUpdateSharingScope', () => {
  let workspace: Workspace
  let user: User
  let post: Post
  let share: Share

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)
    user = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    post = await PostFactory.create(prisma, {
      userId: user.id,
      workspaceId: workspace.id,
    })
    share = await prisma.share.findFirstOrThrow({
      where: { postId: post.id },
    })
  })

  it('invokes updateShareAccessScope', async () => {
    await subject(user.id, share.id, ShareScope.User)
    expect(updateShareService).toHaveBeenCalled()
  })
})
