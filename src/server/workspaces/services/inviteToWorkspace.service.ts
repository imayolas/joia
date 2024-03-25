import { workspaceEditionFilter } from '@/components/workspaces/backend/workspacesBackendUtils'
import { env } from '@/env.mjs'
import { prismaAsTrx } from '@/server/lib/prismaAsTrx'
import { sendEmail } from '@/server/mailer/mailer'
import type { PrismaClientOrTrxClient } from '@/shared/globalTypes'
import { TRPCError } from '@trpc/server'
import { WorkspaceInviteSources } from '../workspaceTypes'
import { addUserToWorkspaceService } from './addUserToWorkspace.service'

export const inviteToWorkspaceService = async (
  prisma: PrismaClientOrTrxClient,
  workspaceId: string,
  invitingUserId: string,
  invitedUserEmail: string,
  disableInvitationEmail = false,
  source: WorkspaceInviteSources = WorkspaceInviteSources.Direct,
) => {
  return await prismaAsTrx(prisma, async (prisma) => {
    const workspace = await prisma.workspace.findUniqueOrThrow({
      select: {
        id: true,
        name: true,
      },
      where: {
        id: workspaceId,
        ...workspaceEditionFilter(invitingUserId),
      },
    })

    const invitedUser = await prisma.user.findUnique({
      select: {
        id: true,
      },
      where: {
        email: invitedUserEmail,
      },
    })

    if (invitedUser) {
      await handleUserExists(
        prisma,
        workspace.id,
        invitingUserId,
        invitedUser.id,
        disableInvitationEmail,
      )
      return null
    }
    return await handleUserDoesNotExist(
      prisma,
      workspace.id,
      invitingUserId,
      invitedUserEmail,
      disableInvitationEmail,
      source,
    )
  })
}

const handleUserExists = async (
  prisma: PrismaClientOrTrxClient,
  workspaceId: string,
  invitingUserId: string,
  invitedUserId: string,
  disableInvitationEmail: boolean,
) => {
  if (invitingUserId === invitedUserId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You cannot invite yourself',
    })
  }
  const result = await addUserToWorkspaceService(
    prisma,
    invitedUserId,
    workspaceId,
  )

  if (!result) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The user is already a member of this workspace',
    })
  }

  const [invitedUser, invitingUser, workspace] = await Promise.all([
    await prisma.user.findUniqueOrThrow({
      select: {
        email: true,
      },
      where: {
        id: invitedUserId,
      },
    }),
    await prisma.user.findUniqueOrThrow({
      select: {
        email: true,
        name: true,
      },
      where: {
        id: invitingUserId,
      },
    }),
    await prisma.workspace.findUniqueOrThrow({
      select: {
        name: true,
      },
      where: {
        id: workspaceId,
      },
    }),
  ])

  if (!invitedUser.email) return

  const invitingUserOrEmail = invitingUser.name ?? invitingUser.email!

  if (disableInvitationEmail) return
  await sendEmailToInvitedUser(
    workspaceId,
    invitingUserOrEmail,
    invitedUser.email,
    workspace.name,
  )
}

const handleUserDoesNotExist = async (
  prisma: PrismaClientOrTrxClient,
  workspaceId: string,
  invitingUserId: string,
  invitedUserEmail: string,
  disableInvitationEmail: boolean,
  source: WorkspaceInviteSources,
) => {
  const existingInvite = await prisma.workspaceInvite.findUnique({
    select: {
      id: true,
    },
    where: {
      email_workspaceId: {
        email: invitedUserEmail,
        workspaceId: workspaceId,
      },
    },
  })

  if (!!existingInvite) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'The user has already been invited to the workspace but has not yet accepted the invitation.',
    })
  }

  const [invitingUser, workspace] = await Promise.all([
    await prisma.user.findUniqueOrThrow({
      select: {
        email: true,
        name: true,
      },
      where: {
        id: invitingUserId,
      },
    }),
    await prisma.workspace.findUniqueOrThrow({
      select: {
        name: true,
      },
      where: {
        id: workspaceId,
      },
    }),
  ])

  const invite = await prisma.workspaceInvite.create({
    data: {
      invitedById: invitingUserId,
      email: invitedUserEmail,
      workspaceId: workspaceId,
      source,
    },
  })

  const invitingUserOrEmail = invitingUser.name ?? invitingUser.email!

  if (!disableInvitationEmail) {
    await sendEmailToInvitedUser(
      workspaceId,
      invitingUserOrEmail,
      invitedUserEmail,
      workspace.name,
    )
  }

  return invite
}

const sendEmailToInvitedUser = async (
  workspaceId: string,
  invitingUserName: string,
  invitedUserEmail: string,
  workspaceName: string,
) => {
  const fromName = invitingUserName ? `${invitingUserName} - via Joia` : 'Joia'

  const subject = `Your invitation to the workspace "${workspaceName}"`

  const workspaceUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/w/${workspaceId}`

  await sendEmail({
    fromName,
    to: invitedUserEmail,
    subject,
    body: getEmailBody(
      invitingUserName,
      workspaceUrl,
      workspaceName,
      invitedUserEmail,
    ),
  })
}

const getEmailBody = (
  inviteeName: string,
  workspaceUrl: string,
  workspaceName: string,
  email: string,
) => {
  return `Hello,

${inviteeName} has invited you to the following workspace at Joia: ${workspaceName}.

To enter the workspace, please click on the following link:
${workspaceUrl}

If you do not have an account, you will be prompted to create one. You must use the following email address to create your account, otherwise the invitation won't work:
${email}

Reach out to us by replying to this email if you have any doubts or trouble signing up.

All the best,
The Joia team`
}
