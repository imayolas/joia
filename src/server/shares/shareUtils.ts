import type { Prisma } from '@prisma/client'

export const scopeShareByWorkspace = (
  whereClause: Prisma.ShareWhereInput,
  workspaceId: string,
) => {
  return {
    ...whereClause,
    sharer: {
      workspaces: {
        some: {
          workspaceId,
        },
      },
    },
  }
}
