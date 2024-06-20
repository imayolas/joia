import { ensureError } from '@/lib/utils'
import { getProviderAndModelFromFullSlug } from '@/server/ai/aiUtils'
import { DefaultAppEngineV2 } from '@/server/ai/lib/DefaultAppEngineV2'
import { aiProvidersFetcherService } from '@/server/ai/services/aiProvidersFetcher.service'
import { getAiProviderKVsService } from '@/server/ai/services/getProvidersForWorkspace.service'
import { authOptions } from '@/server/auth/nextauth'
import {
  createUserOnWorkspaceContext,
  type UserOnWorkspaceContext,
} from '@/server/auth/userOnWorkspaceContext'
import { getApplicableAppConfigToChatService } from '@/server/chats/services/getApplicableAppConfigToChat.service'
import { prisma } from '@/server/db'
import type { AiRegistryMessage } from '@/server/lib/ai-registry/aiRegistryTypes'
import { withMiddlewareForAppRouter } from '@/server/middlewares/withMiddleware'
import { PermissionsVerifier } from '@/server/permissions/PermissionsVerifier'
import { Author } from '@/shared/aiTypesAndMappers'
import { errorLogger } from '@/shared/errors/errorLogger'
import { PermissionAction } from '@/shared/permissions/permissionDefinitions'
import type { Message } from '@prisma/client'
import Promise from 'bluebird'
import createHttpError from 'http-errors'
import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { chain } from 'underscore'
import { z } from 'zod'
import { saveTokenCountForChatRunService } from '../../services/saveTokenCountForChatRun.service'
import { handleChatTitleCreate } from './chatStreamedResponseHandlerUtils'

const zBody = z.object({
  threadId: z.null(),
  message: z.literal(''),
  data: z.object({
    chatId: z.string(),
  }),
})

async function handler(req: NextRequest) {
  let tokenResponse = ''
  let assistantTargetMessageId: string | undefined = undefined

  try {
    const {
      data: { chatId },
    } = await getParsedBody(req)
    const userId = await getRequestUserId()
    const chat = await getChat(chatId)
    await validateUserPermissionsOrThrow(userId, chatId)
    const workspaceId = chat.app.workspaceId

    const context = await createUserOnWorkspaceContext(
      prisma,
      workspaceId,
      userId,
    )

    const [appConfigVersion, messages] = await Promise.all([
      await getAppConfigVersionForChat(context, chatId),
      await getParsedMessagesForChat(chatId),
    ])

    await validateModelIsEnabledOrThrow(
      workspaceId,
      userId,
      appConfigVersion.model,
    )

    const allUnprocessedMessages = [...appConfigVersion.messages, ...messages]

    const {
      messages: allMessages,
      assistantTargetMessage: assistantTargetMessage,
    } = prepareMessagesForPrompt(allUnprocessedMessages)

    assistantTargetMessageId = assistantTargetMessage.id

    // AQUI EMPIEZA LA FIESTA. ANTES ES TODO SETUP. AISLAR EN METODO PRIVADO Y
    // DEVOLVER SOLO LO NECESARIO. Tb se puede testear el metodo privado xa delegar
    // la logica de los distintos error cases en otro lado
    if (!chat.appConfigVersionId) {
      await attachAppConfigVersionToChat(chatId, appConfigVersion.id)
    }

    // Todo: Update chatRun as transaction, in fact run everything as a trx!
    const chatRun = await createChatRun(
      chatId,
      allUnprocessedMessages.map((m) => m.id),
    )

    void handleChatTitleCreate(prisma, workspaceId, userId, chatId)

    // Method to extract provider from model
    // MAS SETUP!
    const { provider: providerSlug, model } = getProviderAndModelFromFullSlug(
      appConfigVersion.model,
    )
    // MAS SETUP!
    const providerKVs = await getAiProviderKVsService(
      prisma,
      workspaceId,
      userId,
      providerSlug,
    )

    const onFinal = async (final: string) => {
      await updateMessage(assistantTargetMessage.id, final)
      await saveTokenCountForChatRunService(prisma, chatRun.id)
    }

    const onToken = (token: string) => {
      tokenResponse += token
    }

    // PÉSIMA GESTIÓN DE ERRORES
    const onError = async (error: Error) => {
      await deleteMessage(assistantTargetMessage.id)
      errorLogger(error)
    }

    // ESTO DEL PROVIDER QUIZA DEBERIA YA IR AL ENGINE
    const provider = aiProvidersFetcherService.getProvider(providerSlug)

    if (!provider) {
      throw new Error(`Provider ${providerSlug} not found`)
    }

    const stream = await provider.executeAsStream(
      {
        provider: providerSlug,
        model,
        messages: allMessages,
        onToken,
        onFinal,
      },
      providerKVs,
    )

    const ctx = {
      messages: allMessages,
      providerSlug,
      modelSlug: model,
      providerKVs,
    }

    const callbacks = {
      onToken,
      onEnd: onFinal,
    }

    return new DefaultAppEngineV2().run(ctx, callbacks)
  } catch (_error) {
    const error = ensureError(_error)
    if (tokenResponse.length && assistantTargetMessageId) {
      await updateMessage(assistantTargetMessageId, tokenResponse)
    } else if (assistantTargetMessageId) {
      await deleteMessage(assistantTargetMessageId)
    }

    errorLogger(error)
    throw createHttpError(403, error.message)
  }
}

const validateUserPermissionsOrThrow = async (
  userId: string,
  chatId: string,
) => {
  const chat = await prisma.chat.findFirstOrThrow({
    where: {
      id: chatId,
    },
    include: {
      app: true,
    },
  })

  await new PermissionsVerifier(prisma).passOrThrowTrpcError(
    PermissionAction.Use,
    userId,
    chat.appId,
  )

  return true
}

const validateModelIsEnabledOrThrow = async (
  workspaceId: string,
  userId: string,
  fullSlug: string,
) => {
  const providersMeta = await aiProvidersFetcherService.getFullAiProvidersMeta(
    workspaceId,
    userId,
  )
  const { provider: providerName, model: modelName } =
    getProviderAndModelFromFullSlug(fullSlug)
  const provider = providersMeta.find(
    (providerMeta) => providerMeta.slug === providerName,
  )
  if (!provider) throw new Error('Provider not found')
  const targetModel = provider.models.find((model) => model.slug === modelName)

  if (!targetModel) {
    throw createHttpError(
      403,
      `The model ${fullSlug} no longer exists. Please select another one.`,
    )
  }

  if (!targetModel.isEnabled) {
    throw createHttpError(
      403,
      `The model "${targetModel.fullPublicName}" is currently not enabled. Please select another one.`,
    )
  }

  if (!targetModel.isSetupOk) {
    throw createHttpError(
      403,
      `The model "${targetModel.fullPublicName}" is not setup correctly. Please select another one.`,
    )
  }

  return true
}

const getChat = async (chatId: string) => {
  return await prisma.chat.findFirstOrThrow({
    where: {
      id: chatId,
    },
    include: {
      app: {
        select: {
          workspaceId: true,
        },
      },
    },
  })
}

const getAppConfigVersionForChat = async (
  uowContext: UserOnWorkspaceContext,
  chatId: string,
) => {
  return await getApplicableAppConfigToChatService(prisma, uowContext, {
    chatId,
  })
}

const attachAppConfigVersionToChat = async (
  chatId: string,
  appConfigVersionId: string,
) => {
  await prisma.chat.update({
    where: {
      id: chatId,
    },
    data: {
      appConfigVersionId,
    },
  })
}

const getParsedMessagesForChat = async (chatId: string) => {
  return await prisma.message.findMany({
    where: {
      chatId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

const getRequestUserId = async () => {
  const session = await getServerSession(authOptions)

  if (!session) throw createHttpError(401, 'You must be logged in.')
  return session.user.id
}

const createChatRun = async (chatId: string, messageIds: string[]) => {
  return await prisma.chatRun.create({
    data: {
      chatId,
      chatRunMessages: {
        create: messageIds.map((messageId) => ({
          messageId,
        })),
      },
    },
  })
}

const updateMessage = async (messageId: string, message: string) => {
  await prisma.message.update({
    where: {
      id: messageId,
    },
    data: {
      message,
    },
  })
}

const deleteMessage = async (messageId: string) => {
  await prisma.message.delete({
    where: {
      id: messageId,
    },
  })
}

interface PreparedMessagesForPrompt {
  messages: AiRegistryMessage[]
  assistantTargetMessage: Message
}

const prepareMessagesForPrompt = (
  messages: Message[],
): PreparedMessagesForPrompt => {
  if (messages.length < 2) {
    throw new Error('Message length should be at least 2')
  }

  // This last message should be maxCreatedAt where the author=assistant and should be empty
  // It shouldn't be sent over
  const assistantTargetMessage = chain(messages)
    .filter(
      (message) =>
        message.author === (Author.Assistant as string) &&
        message.message === null,
    )
    .max((message) => message.createdAt.getTime())
    .value() as Message

  const llmMessagesPayload = messages.filter((message) => {
    if (assistantTargetMessage.id === message.id) {
      return false
    }
    return message.message !== null && message.message !== ''
  })

  return {
    messages: llmMessagesPayload.map(transformMessageModelToPayload),
    assistantTargetMessage: assistantTargetMessage,
  }
}

const transformMessageModelToPayload = (
  message: Message,
): AiRegistryMessage => {
  if (!message.message) throw new Error('Message should have a message')

  return {
    role: message.author as Author,
    content: message.message,
  }
}

const getParsedBody = async (req: NextRequest) => {
  const json = (await req.json()) as unknown
  return zBody.parseAsync(json)
}

export const chatStreamedResponseHandler = withMiddlewareForAppRouter(handler)
