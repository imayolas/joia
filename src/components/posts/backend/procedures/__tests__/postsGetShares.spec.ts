import { prisma } from '@/server/db'
import { getPostSharesService } from '@/server/shares/services/getPostShares.service'
import { PostFactory } from '@/server/testing/factories/PostFactory'
import { ShareFactory } from '@/server/testing/factories/ShareFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { trpcContextSetupHelper } from '@/server/testing/trpcContextSetupHelper'
import { ShareScope, UserAccessLevel } from '@/shared/globalTypes'
import type { Post, Share, User, Workspace } from '@prisma/client'

type MockedGetPostSharesService = jest.MockedFunction<
  typeof getPostSharesService
>

const mockedGetPostSharesService =
  getPostSharesService as MockedGetPostSharesService

jest.mock('@/server/shares/services/getPostShares.service.ts', () => {
  return {
    getPostSharesService: jest.fn(),
  }
})

const subject = async (userId: string, postId: string) => {
  const { caller } = trpcContextSetupHelper(prisma, userId)
  return await caller.posts.getShares({ postId })
}

describe('postsGetShares', () => {
  let workspace: Workspace
  let invitingUser: User
  let invitedUser: User
  let post: Post
  let share: Share

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)
    invitingUser = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })
    invitedUser = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })
    post = await PostFactory.create(prisma, {
      userId: invitingUser.id,
      workspaceId: workspace.id,
    })
    share = await ShareFactory.create(prisma, {
      postId: post.id,
      sharerId: invitingUser.id,
      invitedUserId: invitedUser.id,
    })

    mockedGetPostSharesService.mockImplementation(async () => {
      const shareItem = {
        ...share,
        user: invitedUser,
        workspaceInvite: null,
      }
      return await Promise.resolve([shareItem])
    })
  })

  it('invokes getPostSharesService', async () => {
    await subject(invitingUser.id, post.id)
    expect(getPostSharesService).toHaveBeenCalled()
  })

  it('returns a schema specific response', async () => {
    const response = await subject(invitingUser.id, post.id)

    const firstItem = {
      id: share.id,
      postId: post.id,
      scope: ShareScope.User,
      email: invitedUser.email,
      accessLevel: UserAccessLevel.Use,
      userId: invitedUser.id,
      workspaceInviteId: null,
    }
    expect(response).toEqual([firstItem])
  })
})
