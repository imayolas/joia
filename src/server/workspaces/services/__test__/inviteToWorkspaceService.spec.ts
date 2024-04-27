import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prisma } from '@/server/db'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { faker } from '@faker-js/faker'
import type { User, Workspace } from '@prisma/client'
import { inviteToWorkspaceService } from '../inviteToWorkspace.service'

const subject = async (
  workspaceId: string,
  userId: string,
  invitedUserEmail: string,
) => {
  const context = await createUserOnWorkspaceContext(
    prisma,
    workspaceId,
    userId,
  )

  return await inviteToWorkspaceService(prisma, context, invitedUserEmail)
}

describe('inviteToWorkspaceService', () => {
  let workspace: Workspace
  let invitingUser: User

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)
    invitingUser = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })
  })

  it('creates an invite for the future user', async () => {
    const email = faker.internet.email()
    await subject(workspace.id, invitingUser.id, email)

    const invite = await prisma.workspaceInvite.findFirst({
      where: {
        workspaceId: workspace.id,
        email,
      },
    })

    expect(invite).toMatchObject({
      workspaceId: workspace.id,
      email,
      invitedById: invitingUser.id,
    })
  })

  describe('when the invitedUserEmail has already been invited to the workspace', () => {
    it('throws an error', async () => {
      const email = faker.internet.email()
      await subject(workspace.id, invitingUser.id, email)
      await expect(
        subject(workspace.id, invitingUser.id, email),
      ).rejects.toThrow(
        'The user is already invited to the workspace, but has not yet accepted the invitation.',
      )
    })
  })

  describe('when the invitedUserEmail has already been invited to another workspace', () => {
    it('creates a second invite', async () => {
      const email = faker.internet.email()

      const otherWorkspace = await WorkspaceFactory.create(prisma)
      const otherInvitingUser = await UserFactory.create(prisma, {
        workspaceId: otherWorkspace.id,
      })

      await subject(otherWorkspace.id, otherInvitingUser.id, email)
      await subject(workspace.id, invitingUser.id, email)

      const invites = await prisma.workspaceInvite.findMany({
        where: {
          email,
        },
      })

      expect(invites).toHaveLength(2)
      expect(invites).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            workspaceId: workspace.id,
            email,
            invitedById: invitingUser.id,
          }),
          expect.objectContaining({
            workspaceId: otherWorkspace.id,
            email,
            invitedById: otherInvitingUser.id,
          }),
        ]),
      )
    })
  })

  describe('when the invitedUserEmail already has an account in the same workspace', () => {
    it('throws an error', async () => {
      const email = faker.internet.email()
      await UserFactory.create(prisma, {
        email,
        workspaceId: workspace.id,
      })

      await expect(
        subject(workspace.id, invitingUser.id, email),
      ).rejects.toThrow('The user is already a member of this workspace')
    })
  })

  describe('when the invitedUserEmail already has an account in a different workspace', () => {
    it('throws an error', async () => {
      const email = faker.internet.email()

      const otherWorkspace = await WorkspaceFactory.create(prisma)

      await UserFactory.create(prisma, {
        email,
        workspaceId: otherWorkspace.id,
      })

      await expect(
        subject(workspace.id, invitingUser.id, email),
      ).rejects.toThrow(
        'This person cannot be invited because they already have an account with us.',
      )
    })
  })
})
