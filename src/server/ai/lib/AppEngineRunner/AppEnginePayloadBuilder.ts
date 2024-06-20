import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { getApplicableAppConfigToChatService } from '@/server/chats/services/getApplicableAppConfigToChat.service'
import { getChatByIdService } from '@/server/chats/services/getChatById.service'
import { getMessagesByChatIdService } from '@/server/chats/services/getMessagesByChatId.service'
import { Author } from '@/shared/aiTypesAndMappers'
import type { PrismaClientOrTrxClient } from '@/shared/globalTypes'
import type { Message } from '@prisma/client'
import { Promise } from 'bluebird'
import { chain } from 'underscore'
import { getProviderAndModelFromFullSlug } from '../../aiUtils'
import { getAiProviderKVsService } from '../../services/getProvidersForWorkspace.service'
import type { AppEngineParams } from '../AbstractAppEngine'

export class AppEnginePayloadBuilder {
  constructor(
    private readonly prisma: PrismaClientOrTrxClient,
    private readonly context: UserOnWorkspaceContext,
  ) {}

  async call(chatId: string): Promise<AppEngineParams<Record<string, never>>> {
    const { chat, app } = await this.getChat(chatId)
    const [appConfigVersion, messages] = await Promise.all([
      await this.getAppConfigVersionForChat(chatId),
      await this.buildMessages(chatId),
    ])

    const systemMessage = {
      role: Author.System as const,
      content: appConfigVersion.systemMessage ?? '',
    }

    const model = getProviderAndModelFromFullSlug(appConfigVersion.model)
    const providerKVs = await this.getProviderKVs(
      this.context.workspaceId,
      this.context.userId,
      model.provider,
    )

    return {
      chat,
      app,
      messages,
      systemMessage,
      appConfigVersion,
      modelSlug: model.model,
      providerSlug: model.provider,
      providerKVs,
    }
  }

  private async getChat(chatId: string) {
    const { app, ...chat } = await getChatByIdService(
      this.prisma,
      this.context,
      {
        chatId,
        includeApp: true,
      },
    )

    return {
      chat,
      app,
    }
  }

  private async buildMessages(chatId: string) {
    const messages = await this.getMessagesForChat(chatId)
    return this.prepareMessagesForPrompt(messages)
  }

  private async getAppConfigVersionForChat(chatId: string) {
    return await getApplicableAppConfigToChatService(
      this.prisma,
      this.context,
      {
        chatId,
      },
    )
  }

  private async getMessagesForChat(chatId: string) {
    return (
      await getMessagesByChatIdService(this.prisma, this.context, { chatId })
    ).reverse()
  }

  private async getProviderKVs(
    workspaceId: string,
    userId: string,
    providerSlug: string,
  ) {
    return await getAiProviderKVsService(
      this.prisma,
      workspaceId,
      userId,
      providerSlug,
    )
  }

  private prepareMessagesForPrompt(messages: Message[]) {
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

    return llmMessagesPayload.map((message: Message) => {
      if (!message.message) throw new Error('Message should have a message')

      return {
        role: message.author as Author,
        content: message.message,
      }
    })
  }
}
