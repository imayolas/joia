import { env } from '@/env.mjs'
import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prismaAsTrx } from '@/server/lib/prismaAsTrx'
import { sendEmail } from '@/server/mailer/mailer'
import { inviteToWorkspaceService } from '@/server/workspaces/services/inviteToWorkspace.service'
import { WorkspaceInviteSources } from '@/server/workspaces/workspaceTypes'
import {
  ShareScope,
  UserAccessLevel,
  type PrismaClientOrTrxClient,
  type PrismaTrxClient,
} from '@/shared/globalTypes'
import type { WorkspaceInvite } from '@prisma/client'
import { TRPCError } from '@trpc/server'

const USER_ALREADY_INVITED_ERROR = 'You have already invited this user'

interface PerformSharePayload {
  email: string
  postId: string
}

export const performShareService = async (
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload: PerformSharePayload,
) => {
  const { userId: invitingUserId, workspaceId } = uowContext
  const { email, postId } = payload

  return await prismaAsTrx(prisma, async (prisma) => {
    const invitedUser = await prisma.user.findFirst({
      where: {
        email,
      },
    })

    if (!invitedUser) {
      return await handleInvitedUserDoesNotExist(
        prisma,
        workspaceId,
        invitingUserId,
        email,
        postId,
      )
    }

    return await handleInvitedUserExists(
      prisma,
      invitingUserId,
      invitedUser.id,
      postId,
    )
  })
}

const handleInvitedUserDoesNotExist = async (
  prisma: PrismaTrxClient,
  workspaceId: string,
  invitingUserId: string,
  email: string,
  postId: string,
) => {
  // Check if already invited to the workspace
  let workspaceInvite: WorkspaceInvite | null = null

  workspaceInvite = await prisma.workspaceInvite.findFirst({
    where: {
      email,
      workspaceId,
    },
  })

  if (!workspaceInvite) {
    workspaceInvite = await inviteToWorkspaceService(
      prisma,
      workspaceId,
      invitingUserId,
      email,
      true,
      WorkspaceInviteSources.Share,
    )

    if (!workspaceInvite) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to invite user to workspace. An invite was expected.',
      })
    }
  }

  const existingShare = await prisma.share.findFirst({
    where: {
      postId,
      workspaceInviteId: workspaceInvite.id,
    },
  })

  if (existingShare) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: USER_ALREADY_INVITED_ERROR,
    })
  }

  const share = await prisma.share.create({
    data: {
      postId,
      sharerId: invitingUserId,
      scope: ShareScope.User,
      accessLevel: UserAccessLevel.Use,
      workspaceInviteId: workspaceInvite.id,
    },
  })

  const invitingUser = await prisma.user.findUniqueOrThrow({
    where: {
      id: invitingUserId,
    },
  })

  await sendShareNotificationEmail(invitingUser?.name, email, postId)

  return share
}

const handleInvitedUserExists = async (
  prisma: PrismaTrxClient,
  invitingUserId: string,
  invitedUserId: string,
  postId: string,
) => {
  if (invitingUserId === invitedUserId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You cannot invite yourself',
    })
  }
  const existingShare = await prisma.share.findFirst({
    where: {
      postId,
      sharerId: invitingUserId,
    },
  })

  if (existingShare) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: USER_ALREADY_INVITED_ERROR,
    })
  }

  const share = await prisma.share.create({
    data: {
      postId: postId,
      sharerId: invitingUserId,
      scope: ShareScope.User,
    },
  })

  const [invitingUser, invitedUser] = await Promise.all([
    await prisma.user.findUniqueOrThrow({
      where: {
        id: invitingUserId,
      },
    }),
    await prisma.user.findUniqueOrThrow({
      where: {
        id: invitedUserId,
      },
    }),
  ])

  await sendShareNotificationEmail(
    invitingUser.name,
    invitedUser.email!,
    postId,
  )

  return share
}

const sendShareNotificationEmail = async (
  invitingUserName: string | null,
  invitedUserEmail: string,
  postId: string,
) => {
  const subject = `Your invitation to Joia`
  const postUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/p/${postId}`

  await sendEmail({
    fromName: 'Joia',
    to: invitedUserEmail,
    subject,
    body: getEmailBody(invitingUserName ?? '', postUrl),
  })
}

const getEmailBody = (invitingUserName: string, postUrl: string) => {
  let str = `Hello,
  `

  if (invitingUserName) {
    str += `
${invitingUserName} has shared access to a Chatbot in Joia with you.`
  } else {
    str += `
This is a message from Joia. You have been shared access to a chatbot.`
  }

  str += `

You can access the chatbot through the following link:
${postUrl}

If you do not have an account, you will be prompted to create one.

Thank you,
Joia`

  return str
}
