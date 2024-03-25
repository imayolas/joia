import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prisma } from '@/server/db'
import { sendEmail } from '@/server/mailer/mailer'
import { PostFactory } from '@/server/testing/factories/PostFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { WorkspaceInviteFactory } from '@/server/testing/factories/WorkspaceInviteFactory'
import { inviteToWorkspaceService } from '@/server/workspaces/services/inviteToWorkspace.service'
import { ShareScope, UserAccessLevel } from '@/shared/globalTypes'
import { faker } from '@faker-js/faker'
import type { Post, User, Workspace, WorkspaceInvite } from '@prisma/client'
import { performShareService } from '../performShare.service'

type MockedInviteToWorkspaceService = jest.MockedFunction<
  typeof inviteToWorkspaceService
>

type MockedSendEmail = jest.MockedFunction<typeof sendEmail>

const mockedInviteToWorkspace =
  inviteToWorkspaceService as MockedInviteToWorkspaceService

const mockedSendEmail = sendEmail as MockedSendEmail

jest.mock('@/server/workspaces/services/inviteToWorkspace.service', () => {
  return {
    inviteToWorkspaceService: jest.fn(),
  }
})

const subject = async (
  userId: string,
  workspaceId: string,
  postId: string,
  email: string,
) => {
  const context = await createUserOnWorkspaceContext(
    prisma,
    workspaceId,
    userId,
  )
  return await performShareService(prisma, context, { postId, email })
}

describe('postsSharePerformService', () => {
  let workspace: Workspace
  let invitingUser: User
  let post: Post

  beforeEach(() => {
    mockedInviteToWorkspace.mockClear()
  })

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)
    invitingUser = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    post = await PostFactory.create(prisma, {
      userId: invitingUser.id,
      workspaceId: workspace.id,
    })
  })

  describe('when the invited user exists', () => {
    let invitedUser: User

    beforeEach(async () => {
      invitedUser = await UserFactory.create(prisma, {
        workspaceId: workspace.id,
      })
    })

    it.only('shares the post', async () => {
      const createdShare = await subject(
        invitingUser.id,
        workspace.id,
        post.id,
        invitedUser.email!,
      )
      const shares = await prisma.share.findMany({
        where: { postId: post.id },
      })

      expect(shares).toHaveLength(2)
      expect(shares.find((s) => s.id === createdShare.id)).toMatchObject({
        sharerId: invitingUser.id,
        userId: invitedUser.id,
        workspaceInviteId: null,
        scope: ShareScope.User,
        accessLevel: UserAccessLevel.Use,
      })
    })

    describe('and the user is self', () => {
      it('throws an already invited alert', async () => {
        await expect(
          subject(invitingUser.id, workspace.id, post.id, invitingUser.email!),
        ).rejects.toThrow('You cannot invite yourself')
      })
    })

    describe('and the user is already invited to the chatbot', () => {
      it('throws an already invited alert', async () => {
        await subject(
          invitingUser.id,
          workspace.id,
          post.id,
          invitedUser.email!,
        )

        await expect(
          subject(invitingUser.id, workspace.id, post.id, invitedUser.email!),
        ).rejects.toThrow('You have already invited this user')
      })
    })

    it('sends a custom invite', async () => {
      await subject(invitingUser.id, workspace.id, post.id, invitedUser.email!)
      expect(mockedSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Your invitation to Joia',
          to: invitedUser.email!,
        }),
      )
    })
  })

  describe('when the invited user does not exist', () => {
    let fakeEmail: string
    let workspaceInvite: WorkspaceInvite

    beforeEach(() => {
      fakeEmail = faker.internet.email()

      mockedInviteToWorkspace.mockImplementation(async () => {
        workspaceInvite = await WorkspaceInviteFactory.create(prisma, {
          email: fakeEmail,
          workspaceId: workspace.id,
        })

        return workspaceInvite
      })
    })

    it('invites the user, without sending the original invite email', async () => {
      await subject(invitingUser.id, workspace.id, post.id, fakeEmail)
      expect(inviteToWorkspaceService).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        true,
        expect.anything(),
      )
    })

    it('creates the share', async () => {
      const createdShare = await subject(
        invitingUser.id,
        workspace.id,
        post.id,
        fakeEmail,
      )

      const shares = await prisma.share.findMany({
        where: { postId: post.id },
      })

      expect(shares).toHaveLength(2)

      expect(shares.find((s) => s.id === createdShare.id)).toMatchObject({
        sharerId: invitingUser.id,
        userId: null,
        workspaceInviteId: workspaceInvite.id,
      })
    })

    it('sends a custom invite', async () => {
      await subject(invitingUser.id, workspace.id, post.id, fakeEmail)
      expect(mockedSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Your invitation to Joia',
          to: fakeEmail,
        }),
      )
    })

    describe('and the user is already invited to the chatbot', () => {
      it('throws an already invited alert', async () => {
        await subject(invitingUser.id, workspace.id, post.id, fakeEmail)

        await expect(
          subject(invitingUser.id, workspace.id, post.id, fakeEmail),
        ).rejects.toThrow('You have already invited this user')
      })
    })

    describe('and the user is already invited to the workspace', () => {
      it('omits inviting the user to the workspace', async () => {
        await WorkspaceInviteFactory.create(prisma, {
          email: fakeEmail,
          workspaceId: workspace.id,
        })
        expect(inviteToWorkspaceService).not.toHaveBeenCalled()
      })
    })
  })

  describe('when multiple people are invited', () => {
    let fakeEmail: string
    let workspaceInvite: WorkspaceInvite
    let invitedUser: User

    beforeEach(async () => {
      invitedUser = await UserFactory.create(prisma, {
        workspaceId: workspace.id,
      })

      fakeEmail = faker.internet.email()

      mockedInviteToWorkspace.mockImplementation(async () => {
        workspaceInvite = await WorkspaceInviteFactory.create(prisma, {
          email: fakeEmail,
          workspaceId: workspace.id,
        })

        return workspaceInvite
      })
    })

    it('invites both users', async () => {
      const invitedUser2 = await UserFactory.create(prisma, {
        workspaceId: workspace.id,
      })
      const createdShare1 = await subject(
        invitingUser.id,
        workspace.id,
        post.id,
        invitedUser.email!,
      )
      const createdShare2 = await subject(
        invitingUser.id,
        workspace.id,
        post.id,
        invitedUser2.email!,
      )

      const shares = await prisma.share.findMany({
        where: { postId: post.id },
      })

      expect(shares).toHaveLength(3)
      expect(shares.find((s) => s.id === createdShare1.id)).toMatchObject({
        sharerId: invitingUser.id,
        userId: invitedUser.id,
        workspaceInviteId: null,
      })
      expect(shares.find((s) => s.id === createdShare2.id)).toMatchObject({
        sharerId: invitingUser.id,
        userId: invitedUser2.id,
        workspaceInviteId: null,
      })
    })

    describe('and there are non existing users', () => {
      let workspaceInvite: WorkspaceInvite

      beforeEach(() => {
        mockedInviteToWorkspace.mockImplementation(
          async (_, __, ___, email) => {
            workspaceInvite = await WorkspaceInviteFactory.create(prisma, {
              email: email,
              workspaceId: workspace.id,
            })

            return workspaceInvite
          },
        )
      })
      it('where both are non existing', async () => {
        const firstShare = await subject(
          invitingUser.id,
          workspace.id,
          post.id,
          faker.internet.email(),
        )

        const secondShare = await subject(
          invitingUser.id,
          workspace.id,
          post.id,
          faker.internet.email(),
        )

        const shares = await prisma.share.findMany({
          where: { postId: post.id },
        })

        const workspaceInvites = await prisma.workspaceInvite.findMany({
          where: { workspaceId: workspace.id },
        })
        const workspaceInviteIds = workspaceInvites.map((invite) => invite.id)

        expect(shares).toHaveLength(3)
        expect(workspaceInviteIds).toContain(firstShare.workspaceInviteId)
        expect(workspaceInviteIds).toContain(secondShare.workspaceInviteId)
      })

      it('where there is a mix of non existing and existing', async () => {
        await subject(invitingUser.id, workspace.id, post.id, fakeEmail)
        await subject(
          invitingUser.id,
          workspace.id,
          post.id,
          faker.internet.email(),
        )

        const shares = await prisma.share.findMany({
          where: { postId: post.id },
        })

        expect(shares).toHaveLength(3)
      })
    })
  })
})
