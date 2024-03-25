import { ShareScope } from '@/shared/globalTypes'
import type { PrismaClient, Share } from '@prisma/client'
import { generateBaseForDefaults } from './utils/testingFactoryUtils'

type ShareFactoryFields = {
  sharerId: string
} & Partial<Share>

const generateDefaults = () => {
  return {
    ...generateBaseForDefaults(),
    scope: ShareScope.User,
  }
}

export const ShareFactory = {
  build: (overrides: ShareFactoryFields) => {
    return {
      ...generateDefaults(),
      ...overrides,
    }
  },

  create: async (prisma: PrismaClient, overrides: ShareFactoryFields) => {
    return await prisma.share.create({
      data: {
        ...ShareFactory.build({
          ...overrides,
        }),
      },
    })
  },
}
