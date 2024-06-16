import { env } from '@/env.mjs'
import {
  AbstractAppEngine,
  type AppEngineParams,
} from '@/server/ai/lib/AbstractAppEngine'
import { AppEngineResponseStream } from '@/server/ai/lib/AppEngineResponseStream'
import type { AiRegistryMessage } from '@/server/lib/ai-registry/aiRegistryTypes'
import OpenAI from 'openai'
import { z } from 'zod'

type AiRegistryMessageWithoutSystemRole = Omit<AiRegistryMessage, 'role'> & {
  role: Exclude<AiRegistryMessage['role'], 'system'>
}

const payloadSchema = z.object({
  assistantId: z.string(),
})

type OpeniAssistantsEngineAppPayload = z.infer<typeof payloadSchema>

export class OpenaiAssistantsEngine extends AbstractAppEngine {
  getName() {
    return 'OpenaiAssistantsEngine'
  }

  getPayloadSchema() {
    return payloadSchema
  }

  async run({
    ctx,
    messages,
  }: AppEngineParams<OpeniAssistantsEngineAppPayload>) {
    const { kvs } = ctx
    const openai = new OpenAI({
      // This needs to be provided at runtime
      apiKey: env.INTERNAL_OPENAI_API_KEY,
    })

    const messagesWithoutSystem = messages.map((message) => {
      if (message.role !== 'system') {
        return message as AiRegistryMessageWithoutSystemRole
      }
      return {
        ...message,
        role: 'user',
      } as AiRegistryMessageWithoutSystemRole
    })

    const thread = await openai.beta.threads.create({
      messages: messagesWithoutSystem,
    })
    const threadId = thread.id

    const createdMessage = await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: 'Write the futbol club barcelona hymn lyrics',
    })

    return AppEngineResponseStream(
      {
        threadId,
        messageId: createdMessage.id,
      },

      async ({ pushMessage }) => {
        const streamAsAsyncIterable = openai.beta.threads.runs.stream(
          threadId,
          {
            assistant_id: kvs.assistantId,
          },
        )

        for await (const event of streamAsAsyncIterable) {
          if (event.event === 'thread.message.delta') {
            event.data.delta.content.map((item) => {
              console.log('item', item)
              pushMessage(item.text.value)
            })
          }
        }
      },
    )
  }
}
