import { env } from '@/env.mjs'
import {
  AbstractAppEngine,
  AppEngineCallbacks,
  AppEngineUtils,
  type AppEngineParams,
} from '@/server/ai/lib/AbstractAppEngine'
import type { AiRegistryMessage } from '@/server/lib/ai-registry/aiRegistryTypes'
import OpenAI from 'openai'
import { AssistantStreamEvent } from 'openai/resources/beta/assistants'
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

  async run(
    ctx: AppEngineParams<OpeniAssistantsEngineAppPayload>,
    callbacks: AppEngineCallbacks,
    utils: AppEngineUtils,
  ) {
    const {
      messages,
      providerSlug,
      modelSlug,
      providerKVs,
      targetAssistantRawMessage,
      chatId,
    } = ctx

    const { pushText } = utils

    const { kvs } = { kvs: {} }
    const openai = new OpenAI({
      // This needs to be provided at runtime
      apiKey: env.INTERNAL_OPENAI_API_KEY,
    })

    const messagesWithoutSystem = this.filterSystemMessage(messages)
    const thread = await openai.beta.threads.create({
      messages: messagesWithoutSystem,
    })
    const threadId = thread.id

    const streamAsAsyncIterable = openai.beta.threads.runs.stream(threadId, {
      // assistant_id: kvs.assistantId,
      assistant_id: 'asst_sk18bpznVq02EKXulK5S3X8L',
    })

    for await (const event of streamAsAsyncIterable) {
      if (event.event === 'thread.message.delta') {
        event.data.delta.content?.map((item) => {
          if (item.type === 'text' && item.text?.value) {
            pushText(item.text.value)
          }
        })
      }
    }
  }

  private filterSystemMessage(messages: AiRegistryMessage[]) {
    return messages.map((message) => {
      if (message.role !== 'system') {
        return message as AiRegistryMessageWithoutSystemRole
      }
      return {
        ...message,
        role: 'user',
      } as AiRegistryMessageWithoutSystemRole
    })
  }
}

function isThreadMessageDelta(
  event: AssistantStreamEvent,
): event is AssistantStreamEvent.ThreadMessageDelta {
  return (
    (event as AssistantStreamEvent.ThreadMessageDelta).type ===
    'ThreadMessageDelta'
  )
}