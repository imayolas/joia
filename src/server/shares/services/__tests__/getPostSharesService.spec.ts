import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prisma } from '@/server/db'
import { PostFactory } from '@/server/testing/factories/PostFactory'
import { ShareFactory } from '@/server/testing/factories/ShareFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import type { Post, Share, User, Workspace } from '@prisma/client'
import { getPostSharesService } from '../getPostShares.service'

const subject = async (userId: string, workspaceId: string, postId: string) => {
  const context = await createUserOnWorkspaceContext(
    prisma,
    workspaceId,
    userId,
  )
  return await getPostSharesService(prisma, context, { postId })
}

describe('getPostSharesService', () => {
  let workspace: Workspace
  let userPostOwner: User
  let sharedUser: User
  let post: Post
  let share: Share

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)

    userPostOwner = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    sharedUser = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    post = await PostFactory.create(prisma, {
      userId: userPostOwner.id,
      workspaceId: workspace.id,
    })

    share = await ShareFactory.create(prisma, {
      postId: post.id,
      sharerId: userPostOwner.id,
      invitedUserId: sharedUser.id,
    })
  })

  it('returns the post shares', async () => {
    const otherSharedUser = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    const secondShare = await ShareFactory.create(prisma, {
      postId: post.id,
      sharerId: userPostOwner.id,
      invitedUserId: otherSharedUser.id,
    })

    const result = await subject(sharedUser.id, workspace.id, post.id)

    expect(result).toHaveLength(3)
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining(share),
        expect.objectContaining(secondShare),
      ]),
    )
  })
})
