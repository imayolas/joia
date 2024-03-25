import { ShareScope, UserAccessLevel } from '@/shared/globalTypes'
import type { PrismaClient, Share } from '@prisma/client'
import { generateBaseForDefaults } from './utils/testingFactoryUtils'

type ShareTargetFactoryFields = {
  sharerId: string
  workspaceInviteId?: string
  invitedUserId?: string
} & Partial<Share>

const generateDefaults = () => {
  return {
    ...generateBaseForDefaults(),
    accessLevel: UserAccessLevel.Use,
    scope: ShareScope.User,
  }
}

export const ShareTargetFactory = {
  build: (overrides: ShareTargetFactoryFields) => {
    return {
      ...generateDefaults(),
      ...overrides,
    }
  },

  create: async (prisma: PrismaClient, overrides: ShareTargetFactoryFields) => {
    const { invitedUserId, workspaceInviteId, ...rest } = overrides

    if (!invitedUserId && !workspaceInviteId) {
      throw new Error(
        'You must provide either invitedUserId or workspaceInviteId',
      )
    }

    return await prisma.share.create({
      data: {
        ...ShareTargetFactory.build({
          userId: invitedUserId,
          workspaceInviteId,
          ...rest,
        }),
      },
    })
  },
}
