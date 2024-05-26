import type { Post, User, Workspace } from '@prisma/client'
import { prisma } from 'server/db'
import { PostFactory } from 'server/testing/factories/PostFactory'
import { UserFactory } from 'server/testing/factories/UserFactory'
import { WorkspaceFactory } from 'server/testing/factories/WorkspaceFactory'
import { trpcContextSetupHelper } from 'server/testing/trpcContextSetupHelper'

const subject = async (userId: string, postId: string) => {
  const { caller } = trpcContextSetupHelper(prisma, userId)
  return await caller.chats.createChat({ postId })
}

describe('createChat', () => {
  let workspace: Workspace
  let user: User
  let post: Post

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)

    user = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    post = await PostFactory.create(prisma, {
      userId: user.id,
      workspaceId: workspace.id,
    })
  })

  it('creates a chat', async () => {
    const result = await subject(user.id, post.id)
    const dbChat = await prisma.chat.findFirstOrThrow({
      where: {
        post: {
          id: post.id,
        },
      },
    })
    expect(dbChat.id).toEqual(result.id)
  })

  it('creates a appsOnUsers record', async () => {
    await subject(user.id, post.id)
    const dbAppsOnUsers = await prisma.appsOnUsers.findFirstOrThrow({
      where: {
        appId: post.id,
        userId: user.id,
      },
    })
    expect(dbAppsOnUsers.lastVisitedAt).toBeDefined()
  })
})