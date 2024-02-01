import { env } from '@/env.mjs'
import { prismaAsTrx } from '@/server/lib/prismaAsTrx'
import { sendEmail } from '@/server/mailer/mailer'
import { protectedProcedure } from '@/server/trpc/trpc'
import { addUserToWorkspaceService } from '@/server/workspaces/services/addUserToWorkspace.service'
import { type PrismaClientOrTrxClient } from '@/shared/globalTypes'
import { TRPCError } from '@trpc/server'
import Promise from 'bluebird'
import { z } from 'zod'
import { workspaceEditionFilter } from '../workspacesBackendUtils'

const zInput = z.object({
  workspaceId: z.string(),
  email: z.string(),
})

export const workspacesInviteUserToWorkspace = protectedProcedure
  .input(zInput)
  .mutation(async ({ ctx, input }) => {
    const invitingUserId = ctx.session.user.id

    await prismaAsTrx(ctx.prisma, async (prisma) => {
      const workspace = await prisma.workspace.findUniqueOrThrow({
        select: {
          id: true,
          name: true,
        },
        where: {
          id: input.workspaceId,
          ...workspaceEditionFilter(invitingUserId),
        },
      })

      const invitedUser = await prisma.user.findUnique({
        select: {
          id: true,
        },
        where: {
          email: input.email,
        },
      })

      if (invitedUser) {
        await handleUserExists(
          prisma,
          workspace.id,
          invitingUserId,
          invitedUser.id,
        )
      } else {
        await handleUserDoesNotExist(
          prisma,
          workspace.id,
          invitingUserId,
          input.email,
        )
      }
    })
  })

const handleUserExists = async (
  prisma: PrismaClientOrTrxClient,
  workspaceId: string,
  invitingUserId: string,
  invitedUserId: string,
) => {
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
        'The user is already invited to the workspace, but has not yet accepted the invitation.',
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

  await prisma.workspaceInvite.create({
    data: {
      invitedById: invitingUserId,
      email: invitedUserEmail,
      workspaceId: workspaceId,
    },
  })

  const invitingUserOrEmail = invitingUser.name ?? invitingUser.email!

  await sendEmailToInvitedUser(
    workspaceId,
    invitingUserOrEmail,
    invitedUserEmail,
    workspace.name,
  )
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
