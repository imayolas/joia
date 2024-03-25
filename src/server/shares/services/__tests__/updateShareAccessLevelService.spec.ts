import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prisma } from '@/server/db'
import { PostFactory } from '@/server/testing/factories/PostFactory'
import { ShareFactory } from '@/server/testing/factories/ShareFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { WorkspaceInviteFactory } from '@/server/testing/factories/WorkspaceInviteFactory'
import { WorkspaceInviteSources } from '@/server/workspaces/workspaceTypes'
import { UserAccessLevel, UserAccessLevelActions } from '@/shared/globalTypes'
import { faker } from '@faker-js/faker'
import type {
  Post,
  Share,
  User,
  Workspace,
  WorkspaceInvite,
} from '@prisma/client'
import { updateShareAccessLevelService } from '../updateShareAccessLevel.service'

const subject = async (
  userId: string,
  workspaceId: string,
  shareId: string,
  accessLevel: UserAccessLevelActions,
) => {
  const context = await createUserOnWorkspaceContext(
    prisma,
    workspaceId,
    userId,
  )
  return await updateShareAccessLevelService(prisma, context, {
    shareId,
    accessLevel,
  })
}

describe('updateShareAccessLevelService', () => {
  let workspace: Workspace
  let userCreatingPost: User
  let userInvitedToPost: User
  let post: Post
  let share: Share

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)
    userCreatingPost = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })
    userInvitedToPost = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })
    post = await PostFactory.create(prisma, {
      userId: userCreatingPost.id,
      workspaceId: workspace.id,
    })
    share = await ShareFactory.create(prisma, {
      postId: post.id,
      sharerId: userCreatingPost.id,
      invitedUserId: userInvitedToPost.id,
    })
  })

  it('updates the access level', async () => {
    expect(share.accessLevel).toBe(UserAccessLevel.Use)
    await subject(
      userCreatingPost.id,
      workspace.id,
      share.id,
      UserAccessLevelActions.View,
    )

    const nextShare = await prisma.share.findUniqueOrThrow({
      where: { id: share.id },
    })
    expect(nextShare.accessLevel).toBe(UserAccessLevel.View)
  })

  describe('when the access level is "remove"', () => {
    it('removes the share', async () => {
      await subject(
        userCreatingPost.id,
        workspace.id,
        share.id,
        UserAccessLevelActions.Remove,
      )

      const shares = await prisma.share.findMany({
        where: { postId: post.id },
      })
      expect(shares).toHaveLength(1)
    })

    describe('and the share is an invite (not a user)', () => {
      it('when the workspaceInvite source is not "share", it keeps the invite', async () => {
        const fakeEmail = faker.internet.email()
        const workspaceInvite = await WorkspaceInviteFactory.create(prisma, {
          email: fakeEmail,
          workspaceId: workspace.id,
          source: WorkspaceInviteSources.Direct,
        })

        const shareOfTheInvitedUser = await ShareFactory.create(prisma, {
          postId: post.id,
          sharerId: userCreatingPost.id,
          workspaceInviteId: workspaceInvite.id,
        })

        await subject(
          userCreatingPost.id,
          workspace.id,
          shareOfTheInvitedUser.id,
          UserAccessLevelActions.Remove,
        )

        const nextWorkspaceInvite =
          await prisma.workspaceInvite.findFirstOrThrow({
            where: { id: workspaceInvite.id },
          })

        expect(shareOfTheInvitedUser.workspaceInviteId).toEqual(
          nextWorkspaceInvite.id,
        )
      })

      describe('when the workspaceInvite source is "share"', () => {
        let fakeEmail: string
        let workspaceInvite: WorkspaceInvite
        let shareOfTheInvitedUser: Share

        beforeEach(async () => {
          fakeEmail = faker.internet.email()
          workspaceInvite = await WorkspaceInviteFactory.create(prisma, {
            email: fakeEmail,
            workspaceId: workspace.id,
            source: WorkspaceInviteSources.Share,
          })

          shareOfTheInvitedUser = await ShareFactory.create(prisma, {
            postId: post.id,
            sharerId: userCreatingPost.id,
            workspaceInviteId: workspaceInvite.id,
          })
        })

        it('and it is the last post where the user is invited, it deletes the invite', async () => {
          await subject(
            userCreatingPost.id,
            workspace.id,
            shareOfTheInvitedUser.id,
            UserAccessLevelActions.Remove,
          )

          const nextWorkspaceInvite = await prisma.workspaceInvite.findFirst({
            where: { id: workspaceInvite.id },
          })

          expect(nextWorkspaceInvite).toBeNull()
        })

        it('and it is not the last post where the user is invited, it keeps the invite', async () => {
          const otherPost = await PostFactory.create(prisma, {
            userId: userCreatingPost.id,
            workspaceId: workspace.id,
          })

          const otherShareToTheInvitedUser = await ShareFactory.create(prisma, {
            postId: otherPost.id,
            sharerId: userCreatingPost.id,
            workspaceInviteId: workspaceInvite.id,
          })

          await subject(
            userCreatingPost.id,
            workspace.id,
            otherShareToTheInvitedUser.id,
            UserAccessLevelActions.Remove,
          )

          const nextWorkspaceInvite =
            await prisma.workspaceInvite.findFirstOrThrow({
              where: { id: workspaceInvite.id },
            })

          expect(shareOfTheInvitedUser.workspaceInviteId).toEqual(
            nextWorkspaceInvite.id,
          )
        })
      })
    })
  })
})
