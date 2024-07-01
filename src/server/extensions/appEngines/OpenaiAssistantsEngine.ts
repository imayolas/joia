import { env } from '@/env.mjs'
import {
  AbstractAppEngine,
  type AppEngineCallbacks,
  type AppEngineParams,
} from '@/server/ai/lib/AbstractAppEngine'
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

  async run(
    ctx: AppEngineParams<OpeniAssistantsEngineAppPayload>,
    callbacks: AppEngineCallbacks,
  ) {
    const {
      messages,
      providerSlug,
      modelSlug,
      providerKVs,
      targetAssistantRawMessage,
      chatId,
    } = ctx

    const { pushText } = callbacks

    const { kvs } = { kvs: {} }
    const openai = new OpenAI({
      // This needs to be provided at runtime
      apiKey: env.INTERNAL_OPENAI_API_KEY,
    })

    // TODO: Passs system messsage somewhere, somehow
    const messagesWithoutSystem = this.filterSystemMessage(messages)

    const thread = await openai.beta.threads.create({
      messages: messagesWithoutSystem,
    })
    const threadId = thread.id

    const response = openai.beta.threads.runs.stream(threadId, {
      // assistant_id: kvs.assistantId,
      assistant_id: 'asst_sk18bpznVq02EKXulK5S3X8L',
    })

    for await (const event of response) {
      if (event.event === 'thread.message.delta') {
        for (const item of event.data.delta.content ?? []) {
          if (item.type === 'text' && item.text?.value) {
            await pushText(item.text.value)
          }
        }
      }
      if (event.event === 'thread.run.completed') {
        const usage = event.data.usage

        await Promise.resolve(
          callbacks.usage(
            usage?.prompt_tokens ?? 0,
            usage?.completion_tokens ?? 0,
          ),
        )
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
