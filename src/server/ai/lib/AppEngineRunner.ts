import { Author } from '@/shared/aiTypesAndMappers'
import type { PrismaClientOrTrxClient } from '@/shared/globalTypes'
import type { Message } from '@prisma/client'
import { chain } from 'underscore'
import type { AbstractAppEngine } from './AbstractAppEngine'

export class AppEngineRunner {
  constructor(
    private readonly prisma: PrismaClientOrTrxClient,
    private readonly engines: AbstractAppEngine[],
  ) {}

  async call(chatId: string) {
    let engineName = await this.getEngineNameFromChatId(chatId)
    engineName = 'OpenaiAssistantsEngine'

    if (!engineName) {
      throw new Error('EngineName not found')
    }

    const engine = this.getEngineByName(engineName)
    const ctx = await this.generateEngineRuntimeContext(chatId)
    const messages = await this.generateEngineMessages(chatId)
    return await engine.run({ ctx, messages })
  }

  private getEngineByName(name: string) {
    const engine = this.engines.find((engine) => engine.getName() === name)
    if (!engine) {
      throw new Error(`Engine ${name} not found`)
    }
    return engine
  }

  private async getEngineNameFromChatId(chatId: string) {
    const chat = await this.prisma.chat.findUniqueOrThrow({
      where: {
        id: chatId,
      },
      include: {
        app: true,
      },
    })

    return chat.app.gptEngine
  }

  private async generateEngineRuntimeContext(chatId: string) {
    const { app, ...chat } = await this.prisma.chat.findUniqueOrThrow({
      where: {
        id: chatId,
      },
      include: {
        app: true,
      },
    })
    return {
      chat,
      app,
    }
  }

  private async generateEngineMessages(chatId: string) {
    const messages = await this.getMessagesForChat(chatId)
    return this.prepareMessagesForPrompt(messages)
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

  private async getMessagesForChat(chatId: string) {
    return await this.prisma.message.findMany({
      where: {
        chatId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })
  }
}
