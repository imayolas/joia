import { chatStreamedResponseHandler } from '@/server/chats/handlers/chatStreamedResponse/chatStreamedResponseHandler'
import type { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300 // 5 minutes

export async function POST(req: NextRequest, res: NextResponse) {
  return await chatStreamedResponseHandler(req, res)
}
