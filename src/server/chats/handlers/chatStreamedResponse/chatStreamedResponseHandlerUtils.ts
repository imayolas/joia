import { getProviderAndModelFromFullSlug } from '@/server/ai/aiUtils'
import { getAiProviderKVsWithFallbackToInternalKeysService } from '@/server/ai/services/getProvidersForWorkspace.service'
import { ChatAuthor, OpenAiModelEnum } from '@/shared/aiTypesAndMappers'
import type { PrismaTrxClient } from '@/shared/globalTypes'
import type { PrismaClient } from '@prisma/client'
import { HttpError } from 'http-errors'
import type { NextApiResponse } from 'next'
import OpenAI, { type ClientOptions } from 'openai'

export const handleChatTitleCreate = async (
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
  chatId: string,
) => {
  const chat = await getChat(prisma, chatId)
  if (chat.title) return

  const systemMessage = chat.postConfigVersion?.messages[0]
  const userMessages = chat.messages.filter(
    (message) => message.author === (ChatAuthor.User as string),
  )
  // Todo: improve and search in case there are multiple user messages
  const firstUserMessage = userMessages[0]

  let openaiProviderKVs: ClientOptions
  try {
    openaiProviderKVs = await getAiProviderKVsWithFallbackToInternalKeysService(
      prisma,
      workspaceId,
      userId,
      'openai',
    )
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 403) {
      return
    }
    throw error
  }

  const openai = new OpenAI(openaiProviderKVs)

  let content = chat.post.title ? `MAIN TITLE: ${chat.post.title}. ` : ''
  const instructions = systemMessage?.message?.slice(0, 500)

  const request = firstUserMessage?.message?.slice(0, 500)

  content += instructions && `INSTRUCTIONS: ${instructions}. `
  content += request && `REQUEST: ${request}. `

  const { model } = getProviderAndModelFromFullSlug(OpenAiModelEnum.GPT4)

  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    messages: [
      {
        role: 'system',
        content: TITLE_PROMPT,
        name: 'system',
      },
      { role: 'user', content, name: 'user' },
    ],
    model,
    temperature: 0.2,
  }

  const aiResponse = await openai.chat.completions.create(params)

  const message = aiResponse.choices[0]?.message

  if (!message) return
  const finalTitle = message.content?.replaceAll(`"`, ``)

  if (content) {
    await prisma.chat.update({
      where: {
        id: chatId,
      },
      data: {
        title: finalTitle,
      },
    })
  }
}
const TITLE_PROMPT = `You are a title creator for a document. The document is part of series of similar docs about a topic or question. The title must make it easy to differentiate between different documents of the same topic. 

You'll be given the following inputs:
- Main title: Title of the topic.
- Instructions: Generic context about the topic. They are usually a set of requests that a machine must follow.
- Request: First sentences of a user requesting more information about the topic, which must be responded according to the Instructions.
- Other titles: Titles already used that you should avoid repeating.

If some of the inputs are not sent, then ignore them.

If the Main title already gives some context, avoid giving it again. For example: "Joia's fun facts teller"; avoid a title like this "Fun Facts about the City of Lights" and return something this instead: "City of lights". Essentially, try to avoid repeating words from the title.

Try to make the title less than 35 letters. Respond with just one title. Do not provide anything else different than the title.`

export function chatStreamToResponse(
  stream: ReadableStream,
  response: NextApiResponse,
  init?: { headers?: Record<string, string>; status?: number },
  onError?: (error: Error) => void | Promise<void>,
) {
  response.writeHead(init?.status ?? 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...init?.headers,
  })

  const reader = stream.getReader()
  function read() {
    void reader
      .read()
      .then(({ done, value }: { done: boolean; value?: unknown }) => {
        if (done) {
          response.end()
          return
        }
        response.write(value)
        read()
      })
      .catch((error: Error) => {
        const message = `=====MID_STREAM_ERROR=====${error.message}=====END_MID_STREAM_ERROR=====`
        response.end(message)
        onError && void onError(error)
      })
  }
  read()
}

const getChat = async (prisma: PrismaTrxClient, chatId: string) => {
  return await prisma.chat.findFirstOrThrow({
    where: {
      id: chatId,
    },
    include: {
      messages: true,
      post: {
        select: {
          title: true,
        },
      },
      postConfigVersion: {
        include: {
          messages: true,
        },
      },
    },
  })
}
