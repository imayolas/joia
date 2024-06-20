import { ensureError } from '@/lib/utils'
import { AppEngineRunner } from '@/server/ai/lib/AppEngineRunner/AppEngineRunner'
import { DefaultAppEngine } from '@/server/ai/lib/DefaultAppEngine'
import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prisma } from '@/server/db'
import { appEnginesRegistry } from '@/server/extensions/appEngines/appEngines'
import { errorLogger } from '@/shared/errors/errorLogger'
import createHttpError from 'http-errors'
import { NextResponse, type NextRequest } from 'next/server'
import { saveTokenCountForChatRunService } from '../../services/saveTokenCountForChatRun.service'
import { handleChatTitleCreate } from './chatStreamedResponseHandlerUtils'
import {
  attachAppConfigVersionToChat,
  createChatRun,
  getChatOrThrow,
  getNeededData,
  getParsedBodyOrThrow,
  getSessionOrThrow,
} from './chatStreamedResponseUtils'

export default async function chatStreamedResponseHandlerV2(
  req: NextRequest,
  res: NextResponse,
) {
  let tokenResponse = ''
  let assistantTargetMessageId: string | undefined = undefined
  const { chatId } = await getParsedBodyOrThrow(req)
  const session = await getSessionOrThrow()

  const userId = session.user.id

  const chat = await getChatOrThrow(prisma, userId, chatId)
  const workspaceId = chat.app.workspaceId

  // Test: Uses the right config version
  // Test: Adds all messages as context to the stream
  const {
    appConfigVersion,
    allUnprocessedMessages,
    preparedMessages: { allMessages, assistantTargetMessage },
    model: { model, providerKVs, providerSlug },
  } = await getNeededData(prisma, userId, chatId)

  assistantTargetMessageId = assistantTargetMessage.id

  // TEST ME OUT
  if (!chat.appConfigVersionId) {
    await attachAppConfigVersionToChat(prisma, chatId, appConfigVersion.id)
  }

  const chatRun = await createChatRun(
    prisma,
    chatId,
    allUnprocessedMessages.map((m) => m.id),
  )
  // TODO: Improve, This is ugly: What if it is a transaction and it fails?
  // it is placed here very un-nicely
  // are errors captured?
  // This should run on a high priority queue
  void handleChatTitleCreate(prisma, workspaceId, userId, chatId)

  const onFinal = async (final: string) => {
    // await updateMessage(prisma, assistantTargetMessage.id, final)
    // PENDING: Deprecate token count
    await saveTokenCountForChatRunService(prisma, chatRun.id)
  }

  // const onToken = (token: string) => {
  //   tokenResponse += token
  // }

  // // PÉSIMA GESTIÓN DE ERRORES
  // const onError = async (error: Error) => {
  //   await deleteMessage(prisma, assistantTargetMessage.id)
  //   errorLogger(error)
  // }

  const engines = [...appEnginesRegistry, new DefaultAppEngine()]

  try {
    const context = await createUserOnWorkspaceContext(
      prisma,
      workspaceId,
      userId,
    )
    const appEngineRunner = new AppEngineRunner(prisma, engines, context)
    const stream = await appEngineRunner.call(chatId)

    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
    }
    return new NextResponse(stream, { headers })
  } catch (_error) {
    const error = ensureError(_error)
    // if (tokenResponse.length && assistantTargetMessageId) {
    //   await updateMessage(prisma, assistantTargetMessageId, tokenResponse)
    // } else if (assistantTargetMessageId) {
    //   await deleteMessage(prisma, assistantTargetMessageId)
    // }

    errorLogger(error)
    throw createHttpError(403, error.message)
  }
}
