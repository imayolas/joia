import { WorkspaceInviteSources } from '@/server/workspaces/workspaceTypes'
import { faker } from '@faker-js/faker'
import type { PrismaClient, WorkspaceInvite } from '@prisma/client'

type WorkspaceInviteFields = {
  workspaceId: string
} & Partial<WorkspaceInvite>

const generateDefaults = () => {
  return {
    id: faker.string.nanoid(),
    email: faker.internet.email(),
    source: WorkspaceInviteSources.Direct,
  }
}

export const WorkspaceInviteFactory = {
  build: (overrides: WorkspaceInviteFields) => {
    return {
      ...generateDefaults(),
      ...overrides,
    }
  },

  create: async (prisma: PrismaClient, overrides: WorkspaceInviteFields) => {
    return await prisma.workspaceInvite.create({
      data: WorkspaceInviteFactory.build(overrides),
    })
  },
}
