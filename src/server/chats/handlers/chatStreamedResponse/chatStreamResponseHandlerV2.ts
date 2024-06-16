import { AppEngineRunner } from '@/server/ai/lib/AppEngineRunner'
import { authOptions } from '@/server/auth/nextauth'
import { prisma } from '@/server/db'
import { enginesRegistry } from '@/server/extensions/appEngines/appEngines'
import { getServerSession } from 'next-auth'

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

const zBody = z.object({
  threadId: z.null(),
  message: z.literal(''),
  data: z.object({
    chatId: z.string(),
  }),
})

export default async function chatStreamedResponseHandlerV2(
  req: NextRequest,
  res: NextResponse,
) {
  const {
    data: { chatId },
  } = zBody.parse(await req.json())

  const session = await getServerSession(authOptions)
  session?.user.id
  if (!session) {
    return new NextResponse(null, { status: 401 })
  }
  const userId = session.user.id
  const appEngineRunner = new AppEngineRunner(prisma, enginesRegistry)
  const stream = await appEngineRunner.call(userId, chatId)

  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
  }
  return new NextResponse(stream, { headers })
}
