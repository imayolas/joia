import { prisma } from '@/server/db'
import { PermissionsVerifier } from '@/server/permissions/PermissionsVerifier'
import { AppFactory } from '@/server/testing/factories/AppFactory'
import { ChatFactory } from '@/server/testing/factories/ChatFactory'
import { MessageFactory } from '@/server/testing/factories/MessageFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { Author } from '@/shared/aiTypesAndMappers'
import { PermissionAction } from '@/shared/permissions/permissionDefinitions'
import type { App, Chat, User, Workspace } from '@prisma/client'
import type chalk from 'chalk'
import { mockDeep } from 'jest-mock-extended'
import { NextRequest, NextResponse } from 'next/server'
import chatStreamedResponseHandlerV2 from '../chatStreamResponseHandlerV2'

jest.mock('next-auth', () => {
  return {
    getServerSession: jest.fn(),
  }
})
jest.mock('@/server/chats/handlers/chatStreamedResponse/tempAppEngineRunner')

// This is needed to avoid a random TS error
jest.mock('chalk', () => mockDeep<typeof chalk>())

jest.mock(
  '@/server/chats/handlers/chatStreamedResponse/chatStreamedResponseHandlerUtils',
  () => {
    return {
      handleChatTitleCreate: jest.fn(),
    }
  },
)

const subject = async (
  data: Record<string, string>,
  userId?: string | null,
) => {
  const body = {
    threadId: null,
    message: '',
    data,
  }
  const nextAuth = await import('next-auth')
  const resolvedValueForNextAuth = userId ? { user: { id: userId } } : null
  jest
    .spyOn(nextAuth, 'getServerSession')
    .mockResolvedValue(resolvedValueForNextAuth)
  const request = new NextRequest('https://llamaworkspace.ai/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const response = new NextResponse()
  return await chatStreamedResponseHandlerV2(request, response)
}

describe('chatStreamedResponseHandlerV2', () => {
  let workspace: Workspace
  let user: User
  let app: App
  let chat: Chat

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)

    user = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    app = await AppFactory.create(prisma, {
      userId: user.id,
      workspaceId: workspace.id,
    })
    chat = await ChatFactory.create(prisma, {
      appId: app.id,
      authorId: user.id,
    })
    await MessageFactory.create(prisma, {
      chatId: chat.id,
      author: Author.User,
      message: 'Hello',
    })
    await MessageFactory.create(prisma, {
      chatId: chat.id,
      author: Author.Assistant,
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fails on a non-valid body', async () => {
    await expect(
      subject(
        {
          chatIdxx: '123',
        },
        user.id,
      ),
    ).rejects.toThrow()
  })

  it('calls PermissionsVerifier', async () => {
    const spy = jest.spyOn(
      PermissionsVerifier.prototype,
      'passOrThrowTrpcError',
    )

    await subject(
      {
        chatId: chat.id,
      },
      user.id,
    )

    expect(spy).toHaveBeenCalledWith(
      PermissionAction.Use,
      expect.anything(),
      expect.anything(),
    )
  })

  describe('when unauthenticated', () => {
    beforeEach(async () => {
      const nextAuth = await import('next-auth')
      jest.spyOn(nextAuth, 'getServerSession').mockResolvedValue(null)
    })

    it('fails with Unauthorized', async () => {
      await expect(
        subject(
          {
            chatId: chat.id,
          },
          null,
        ),
      ).rejects.toThrow('Unauthorized')

      await expect(subject({ chatId: chat.id }, null)).rejects.toMatchObject({
        status: 401,
      })
    })
  })
})
