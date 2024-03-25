import { prisma } from '@/server/db'
import { PostFactory } from '@/server/testing/factories/PostFactory'
import { ShareFactory } from '@/server/testing/factories/ShareFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { WorkspaceInviteFactory } from '@/server/testing/factories/WorkspaceInviteFactory'
import { faker } from '@faker-js/faker'
import type { Share, User, Workspace, WorkspaceInvite } from '@prisma/client'
import { settleWorkspaceInvitesForNewUserService } from '../settleWorkspaceInvitesForNewUser.service'

const subject = async (userId: string) => {
  return await settleWorkspaceInvitesForNewUserService(prisma, userId)
}

describe('settleWorkspaceInvitesForNewUserService', () => {
  let workspace1: Workspace
  let workspace2: Workspace
  let invitedUser: User

  beforeEach(async () => {
    const email = faker.internet.email()
    workspace1 = await WorkspaceFactory.create(prisma)
    workspace2 = await WorkspaceFactory.create(prisma)
    invitedUser = await UserFactory.create(prisma, {
      workspaceId: workspace1.id,
      email,
    })

    await WorkspaceInviteFactory.create(prisma, {
      email,
      workspaceId: workspace1.id,
    })
    await WorkspaceInviteFactory.create(prisma, {
      email,
      workspaceId: workspace2.id,
    })
  })

  it('adds user to the workspaces they were invited to', async () => {
    await subject(invitedUser.id)
    const workspaceInvites = await prisma.usersOnWorkspaces.findMany({
      where: {
        workspaceId: { in: [workspace1.id, workspace2.id] },
        userId: invitedUser.id,
      },
    })

    expect(workspaceInvites).toHaveLength(2)
  })

  it('removes the invites', async () => {
    await subject(invitedUser.id)
    const workspaceInvites = await prisma.workspaceInvite.findMany({
      where: { workspaceId: { in: [workspace1.id, workspace2.id] } },
    })

    expect(workspaceInvites).toHaveLength(0)
  })

  describe('when the user was not invited to any workspaces', () => {
    it('does not error', async () => {
      await expect(subject(invitedUser.id)).resolves.not.toThrow()
    })
  })

  describe('when the user has shares assigned to him', () => {
    let email: string
    let secondUserInvite: WorkspaceInvite
    let secondInvitedUser: User
    let share1: Share, share2: Share, share3: Share

    beforeEach(async () => {
      const invitingUser1 = await UserFactory.create(prisma, {
        workspaceId: workspace1.id,
      })
      const invitingUser2 = await UserFactory.create(prisma, {
        workspaceId: workspace1.id,
      })
      const invitingUser3 = await UserFactory.create(prisma, {
        workspaceId: workspace2.id,
      })

      const post1 = await PostFactory.create(prisma, {
        userId: invitingUser1.id,
        workspaceId: workspace1.id,
      })
      const post2 = await PostFactory.create(prisma, {
        userId: invitingUser2.id,
        workspaceId: workspace1.id,
      })
      const post3 = await PostFactory.create(prisma, {
        userId: invitingUser3.id,
        workspaceId: workspace2.id,
      })

      email = faker.internet.email()
      secondUserInvite = await WorkspaceInviteFactory.create(prisma, {
        email,
        workspaceId: workspace1.id,
      })

      share1 = await ShareFactory.create(prisma, {
        postId: post1.id,
        sharerId: invitingUser1.id,
        workspaceInviteId: secondUserInvite.id,
      })
      share2 = await ShareFactory.create(prisma, {
        postId: post2.id,
        sharerId: invitingUser2.id,
        workspaceInviteId: secondUserInvite.id,
      })
      share3 = await ShareFactory.create(prisma, {
        postId: post3.id,
        sharerId: invitingUser3.id,
        workspaceInviteId: secondUserInvite.id,
      })
      secondInvitedUser = await UserFactory.create(prisma, {
        workspaceId: workspace1.id,
        email,
      })
    })

    it('settles the shares', async () => {
      await subject(secondInvitedUser.id)
      const shares = await prisma.share.findMany({
        where: { id: { in: [share1.id, share2.id, share3.id] } },
      })

      expect(shares).toHaveLength(3)
      expect(shares).toEqual([
        expect.objectContaining({
          userId: secondInvitedUser.id,
          workspaceInviteId: null,
        }),
        expect.objectContaining({
          userId: secondInvitedUser.id,
          workspaceInviteId: null,
        }),
        expect.objectContaining({
          userId: secondInvitedUser.id,
          workspaceInviteId: null,
        }),
      ])
    })
  })
})
