import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prismaAsTrx } from '@/server/lib/prismaAsTrx'
import { ShareScope, type PrismaClientOrTrxClient } from '@/shared/globalTypes'
import { scopeShareByWorkspace } from '../shareUtils'

interface UpdateShareAccessLevelPayload {
  shareId: string
  scope: ShareScope
}

export const updateShareService = async (
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload: UpdateShareAccessLevelPayload,
) => {
  const { workspaceId } = uowContext
  const { shareId, ...rest } = payload

  return await prismaAsTrx(prisma, async (prisma) => {
    await prisma.share.findFirstOrThrow({
      where: scopeShareByWorkspace(
        {
          id: shareId,
        },
        workspaceId,
      ),
    })

    return await prisma.share.update({
      where: {
        id: shareId,
      },
      data: rest,
    })
  })
}
