import { prisma } from '@/server/db'
import { postCreateRepo } from '@/server/posts/repositories/postsCreateRepo'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { UserAccessLevel } from '@/shared/globalTypes'

describe('postCreateRepo', () => {
  const input = { title: 'Test Post' }

  it.only('creates a new post', async () => {
    const workspace = await WorkspaceFactory.create(prisma)
    const user = await UserFactory.create(prisma, { workspaceId: workspace.id })
    await postCreateRepo(prisma, workspace.id, user.id, input)

    const post = await prisma.post.findFirstOrThrow({
      where: {
        userId: user.id,
      },
    })

    expect(post).toMatchObject({
      title: 'Test Post',
    })
  })

  it('creates a new chat for the post', async () => {
    const workspace = await WorkspaceFactory.create(prisma)
    const user = await UserFactory.create(prisma, { workspaceId: workspace.id })
    const post = await postCreateRepo(prisma, workspace.id, user.id, input)

    const chat = await prisma.chat.findFirstOrThrow({
      where: {
        postId: post.id,
        authorId: user.id,
      },
    })

    expect(chat).toBeDefined()
  })

  it('creates an Owner-based postShare for the post', async () => {
    const workspace = await WorkspaceFactory.create(prisma)
    const user = await UserFactory.create(prisma, { workspaceId: workspace.id })
    const post = await postCreateRepo(prisma, workspace.id, user.id, input)

    const postShare = await prisma.postShare.findFirstOrThrow({
      where: {
        postId: post.id,
      },
    })

    expect(postShare).toMatchObject({
      userId: user.id,
      accessLevel: UserAccessLevel.Owner,
    })
  })

  it('creates a first postConfigVersion', async () => {
    const weirdModel = 'a_weird_model'
    const workspace = await WorkspaceFactory.create(prisma)
    const user = await UserFactory.create(prisma, {
      defaultModel: weirdModel,
      workspaceId: workspace.id,
    })

    const post = await postCreateRepo(prisma, workspace.id, user.id, input)

    const postShare = await prisma.postConfigVersion.findFirstOrThrow({
      where: {
        postId: post.id,
      },
    })

    expect(postShare).toMatchObject({
      model: weirdModel,
    })
  })
})
