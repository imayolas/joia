import { AppEngineRunner } from '@/server/ai/lib/AppEngineRunner'
import { prisma } from '@/server/db'
import { enginesRegistry } from '@/server/extensions/appEngines/appEngines'

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

const zBody = z.object({
  threadId: z.null(),
  message: z.literal(''),
  data: z.object({
    chatId: z.string(),
  }),
})

export default async function chatStreamedResponseHandlerV2(req: NextRequest) {
  const {
    data: { chatId },
  } = zBody.parse(await req.json())

  const appEngineRunner = new AppEngineRunner(prisma, enginesRegistry)
  const stream = await appEngineRunner.call(chatId)

  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
  }
  return new NextResponse(stream, { headers })
}
