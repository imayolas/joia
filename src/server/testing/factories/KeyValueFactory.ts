import type { KeyValue, PrismaClient } from '@prisma/client'
import { generateBaseForDefaults } from './utils/testingFactoryUtils'

type KeyValueFactoryFields = {
  appId: string
  key: string
  value: string
  type: string
} & Partial<KeyValue>

const generateDefaults = () => {
  return {
    ...generateBaseForDefaults(),
  }
}

export const AppFactory = {
  build: (overrides: KeyValueFactoryFields) => {
    return {
      ...generateDefaults(),
      ...overrides,
    }
  },

  create: async (prisma: PrismaClient, overrides: KeyValueFactoryFields) => {
    return await prisma.keyValue.create({
      data: AppFactory.build(overrides),
    })
  },
}
