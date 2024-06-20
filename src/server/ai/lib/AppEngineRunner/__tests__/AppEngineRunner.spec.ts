import { AppEngineType } from '@/components/apps/appsTypes'
import { safeReadableStreamPipe } from '@/lib/streamUtils'
import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prisma } from '@/server/db'
import { AppConfigVersionFactory } from '@/server/testing/factories/AppConfigVersionFactory'
import { AppFactory } from '@/server/testing/factories/AppFactory'
import { ChatFactory } from '@/server/testing/factories/ChatFactory'
import { MessageFactory } from '@/server/testing/factories/MessageFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { Author } from '@/shared/aiTypesAndMappers'
import type {
  App,
  AppConfigVersion,
  Chat,
  Message,
  User,
  Workspace,
} from '@prisma/client'
import {
  AbstractAppEngine,
  type AppEngineCallbacks,
  type AppEngineParams,
} from '../../AbstractAppEngine'
import { AppEnginePayloadBuilder } from '../AppEnginePayloadBuilder'
import { AppEngineRunner } from '../AppEngineRunner'

type MockAppEngineKvs = {
  name: string
}

class MockAppEngine extends AbstractAppEngine {
  getName(): string {
    return 'default'
  }

  async run(
    params: AppEngineParams<MockAppEngineKvs>,
    callbacks: AppEngineCallbacks,
  ) {
    const mockStream = new ReadableStream<unknown>({
      async start(controller) {
        controller.enqueue('This is ')
        controller.enqueue('a test stream')
        controller.close()
        await callbacks.onEnd('This is a test stream')
      },
    })

    return Promise.resolve(mockStream)
  }
}

class FailingMockAppEngine extends AbstractAppEngine {
  private readonly producesContent: boolean

  constructor(producesContent = true) {
    super()
    this.producesContent = producesContent
  }
  getName(): string {
    return 'default'
  }

  async run(
    params: AppEngineParams<MockAppEngineKvs>,
    callbacks: AppEngineCallbacks,
  ) {
    const producesContent = this.producesContent

    const mockStream = new ReadableStream<unknown>({
      async start(controller) {
        if (producesContent) {
          controller.enqueue('This is ')
          controller.enqueue('a test stream')
        }
        throw new Error('This is a test error')
        // const partial = producesContent ? 'This is a test stream' : ''
        // console.log(222)
        // await callbacks.onError(new Error('This is a test error'), partial)
        // console.log(33333)
      },
    })

    return Promise.resolve(mockStream)
  }
}

const subject = async (
  appEngines: AbstractAppEngine[],
  workspaceId: string,
  userId: string,
  chatId: string,
) => {
  const context = await createUserOnWorkspaceContext(
    prisma,
    workspaceId,
    userId,
  )
  const appEngineRunner = new AppEngineRunner(prisma, appEngines, context)
  return await appEngineRunner.call(chatId)
}

describe('AppEngineRunner', () => {
  let workspace: Workspace
  let user: User
  let app: App
  let chat: Chat
  let firstUserMessage: Message
  let firstAssistantMessage: Message
  let systemMessage: Message
  let mockAppEngine: AbstractAppEngine
  let nextAppConfigVersion: AppConfigVersion

  beforeEach(() => {
    mockAppEngine = new MockAppEngine()
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    workspace = await WorkspaceFactory.create(prisma)
    user = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    app = await AppFactory.create(prisma, {
      userId: user.id,
      workspaceId: workspace.id,
      engineType: AppEngineType.Default,
    })

    nextAppConfigVersion = await AppConfigVersionFactory.create(prisma, {
      appId: app.id,
      systemMessage: 'This is a system message',
    })

    chat = await ChatFactory.create(prisma, {
      appId: app.id,
      authorId: user.id,
    })
    firstUserMessage = await MessageFactory.create(prisma, {
      author: Author.User,
      message: 'hello',
      chatId: chat.id,
    })
    firstAssistantMessage = await MessageFactory.create(prisma, {
      author: Author.Assistant,
      message: null,
      chatId: chat.id,
    })
  })

  describe('call', () => {
    describe('when engineType is not set', () => {
      it('throws an error', async () => {
        const otherApp = await AppFactory.create(prisma, {
          userId: user.id,
          workspaceId: workspace.id,
          engineType: null,
        })
        const otherChat = await ChatFactory.create(prisma, {
          appId: otherApp.id,
          authorId: user.id,
        })
        await expect(
          subject([mockAppEngine], workspace.id, user.id, otherChat.id),
        ).rejects.toThrow('engineType is not yet set')
      })
    })

    describe('when engineType is not default', () => {
      it('throws an error', async () => {
        const otherApp = await AppFactory.create(prisma, {
          userId: user.id,
          workspaceId: workspace.id,
          engineType: AppEngineType.Custom,
        })
        const otherChat = await ChatFactory.create(prisma, {
          appId: otherApp.id,
          authorId: user.id,
        })
        await expect(
          subject([mockAppEngine], workspace.id, user.id, otherChat.id),
        ).rejects.toThrow('non-default engineType is not yet supported')
      })
    })

    it('builds the payload using the AppEnginePayloadBuilder class', async () => {
      const spy = jest.spyOn(AppEnginePayloadBuilder.prototype, 'call')

      await subject([mockAppEngine], workspace.id, user.id, chat.id)
      expect(spy).toHaveBeenCalledWith(chat.id)
    })

    it('calls the target engine', async () => {
      const runMock = jest.spyOn(mockAppEngine, 'run').mockResolvedValueOnce(
        new ReadableStream<unknown>({
          start(controller) {
            controller.enqueue({ data: 'testData' })
            controller.close()
          },
        }),
      )
      await subject([mockAppEngine], workspace.id, user.id, chat.id)
      const { messages: systemMessages, ...appConfigVersion } =
        await prisma.appConfigVersion.findFirstOrThrow({
          where: {
            appId: app.id,
          },
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            messages: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        })

      expect(runMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chat,
          app,
        }),
        {
          /* eslint-disable @typescript-eslint/no-unsafe-assignment */
          onToken: expect.any(Function),
          onError: expect.any(Function),
          onEnd: expect.any(Function),
          /* eslint-enable @typescript-eslint/no-unsafe-assignment */
        },
      )
      expect(runMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: Author.User,
              content: firstUserMessage.message,
            },
          ],
        }),
        expect.anything(),
      )
      expect(runMock).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          appConfigVersion: expect.objectContaining({
            ...appConfigVersion,
            systemMessage: 'This is a system message',
            messages: systemMessages,
          }),
        }),
        expect.anything(),
      )
    })

    describe('onEnd', () => {
      it('persists the result to the db', async () => {
        const res = await subject(
          [mockAppEngine],
          workspace.id,
          user.id,
          chat.id,
        )
        safeReadableStreamPipe(res, {
          onEnd: async () => {
            const messageInDb = await prisma.message.findFirstOrThrow({
              where: {
                chatId: chat.id,
              },
              orderBy: {
                createdAt: 'desc',
              },
            })

            expect(messageInDb.message).toBe('This is a test stream')
          },
        })
      })
    })
    describe('onError', () => {
      xit('when the message has content persists the result to the db', async () => {
        const failingMockAppEngine = new FailingMockAppEngine(false)

        const res = await subject(
          [failingMockAppEngine],
          workspace.id,
          user.id,
          chat.id,
        )
        await new Promise<void>((resolve, reject) => {
          safeReadableStreamPipe(res, {
            onError: async () => {
              const messageInDb = await prisma.message.findMany({
                where: {
                  chatId: chat.id,
                  author: Author.Assistant,
                },
                orderBy: {
                  createdAt: 'desc',
                },
              })

              try {
                expect(messageInDb[0]!.message).toBe('This is a test stream')
                resolve()
              } catch (error) {
                reject(error)
              }
            },
          })
        })
      })

      xit('when the message is empty it deletes the message from the db', async () => {
        const failingMockAppEngine = new FailingMockAppEngine(false)
        const res = await subject(
          [failingMockAppEngine],
          workspace.id,
          user.id,
          chat.id,
        )

        safeReadableStreamPipe(res, {
          onError: async () => {
            const messageInDb = await prisma.message.findMany({
              where: {
                chatId: chat.id,
              },
              orderBy: {
                createdAt: 'desc',
              },
            })

            expect(messageInDb.length).toEqual(10)
          },
        })
      })
    })
  })
})
