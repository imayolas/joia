import { getProviderAndModelFromFullSlug } from '@/server/ai/aiUtils'
import { aiProvidersFetcherService } from '@/server/ai/services/aiProvidersFetcher.service'
import { getAiProviderKVsService } from '@/server/ai/services/getProvidersForWorkspace.service'
import { authOptions } from '@/server/auth/nextauth'
import {
  createUserOnWorkspaceContext,
  type UserOnWorkspaceContext,
} from '@/server/auth/userOnWorkspaceContext'
import type { AiRegistryMessage } from '@/server/lib/ai-registry/aiRegistryTypes'
import { PermissionsVerifier } from '@/server/permissions/PermissionsVerifier'
import { Author } from '@/shared/aiTypesAndMappers'
import type { PrismaTrxClient } from '@/shared/globalTypes'
import { PermissionAction } from '@/shared/permissions/permissionDefinitions'
import type { Message, PrismaClient } from '@prisma/client'
import { Promise } from 'bluebird'
import createHttpError from 'http-errors'
import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { chain } from 'underscore'
import { z } from 'zod'
import { getApplicableAppConfigToChatService } from '../../services/getApplicableAppConfigToChat.service'

const zBody = z.object({
  threadId: z.null(),
  message: z.literal(''),
  data: z.object({
    chatId: z.string(),
  }),
})

export const getParsedBodyOrThrow = async (req: NextRequest) => {
  const { data } = zBody.parse(await req.json())
  return data
}

export const getSessionOrThrow = async () => {
  const session = await getServerSession(authOptions)
  if (!session) {
    throw createHttpError(401, 'Unauthorized')
  }
  return session
}

export const getChatOrThrow = async (
  prisma: PrismaTrxClient,
  userId: string,
  chatId: string,
) => {
  const chat = await prisma.chat.findFirstOrThrow({
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

  await new PermissionsVerifier(prisma).passOrThrowTrpcError(
    PermissionAction.Use,
    userId,
    chat.appId,
  )

  return chat
}

export const createContext = async (
  prisma: PrismaTrxClient,
  workspaceId: string,
  userId: string,
) => {
  return await createUserOnWorkspaceContext(prisma, workspaceId, userId)
}

export const getNeededData = async (
  prisma: PrismaClient,
  userId: string,
  chatId: string,
) => {
  const chat = await getChatOrThrow(prisma, userId, chatId)
  const workspaceId = chat.app.workspaceId
  const context = await createContext(prisma, workspaceId, userId)
  const [appConfigVersion, messages] = await Promise.all([
    await getAppConfigVersionForChat(prisma, context, chatId),
    await getMessagesForChat(prisma, chatId),
  ])
  const { provider: providerSlug, model } = getProviderAndModelFromFullSlug(
    appConfigVersion.model,
  )

  const providerKVs = await getAiProviderKVsService(
    prisma,
    workspaceId,
    userId,
    providerSlug,
  )

  const allUnprocessedMessages = [...appConfigVersion.messages, ...messages]

  return {
    appConfigVersion,
    allUnprocessedMessages,
    preparedMessages: prepareMessagesForPrompt(allUnprocessedMessages),
    model: {
      providerSlug,
      model,
      providerKVs,
    },
  }
}

export const getAppConfigVersionForChat = async (
  prisma: PrismaTrxClient,
  uowContext: UserOnWorkspaceContext,
  chatId: string,
) => {
  return await getApplicableAppConfigToChatService(prisma, uowContext, {
    chatId,
  })
}

export const getMessagesForChat = async (
  prisma: PrismaTrxClient,
  chatId: string,
) => {
  return await prisma.message.findMany({
    where: {
      chatId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

export const validateModelIsEnabledOrThrow = async (
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

export const attachAppConfigVersionToChat = async (
  prisma: PrismaTrxClient,
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

export const createChatRun = async (
  prisma: PrismaTrxClient,
  chatId: string,
  messageIds: string[],
) => {
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

export const updateMessage = async (
  prisma: PrismaClient,
  messageId: string,
  message: string,
) => {
  await prisma.message.update({
    where: {
      id: messageId,
    },
    data: {
      message,
    },
  })
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

interface PreparedMessagesForPrompt {
  allMessages: AiRegistryMessage[]
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
    allMessages: llmMessagesPayload.map(transformMessageModelToPayload),
    assistantTargetMessage: assistantTargetMessage,
  }
}

export const deleteMessage = async (
  prisma: PrismaClient,
  messageId: string,
) => {
  await prisma.message.delete({
    where: {
      id: messageId,
    },
  })
}
