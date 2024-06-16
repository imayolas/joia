import chatStreamedResponseHandlerV2 from '@/server/chats/handlers/chatStreamedResponse/chatStreamResponseHandlerV2'
import type { NextRequest } from 'next/server'

export const maxDuration = 300 // 5 minutes

export async function POST(req: NextRequest) {
  return await chatStreamedResponseHandlerV2(req)
}
