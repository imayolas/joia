import {
  AbstractAppEngine,
  type AppEngineCallbacks,
  type AppEngineParams,
} from '@/server/ai/lib/AbstractAppEngine'
import { aiProvidersFetcherService } from '@/server/ai/services/aiProvidersFetcher.service'
import type { AiRegistryMessage } from '@/server/lib/ai-registry/aiRegistryTypes'
import { StreamingTextResponse } from 'ai'

import { safeReadableStreamPipe } from '@/lib/streamUtils'
import { z } from 'zod'

const payloadSchema = z.object({
  // assistantId: z.string(),
})

type DefaultAppEginePayload = z.infer<typeof payloadSchema>

export class DefaultAppEngine extends AbstractAppEngine {
  getName() {
    return 'default'
  }

  async run(
    ctx: AppEngineParams<DefaultAppEginePayload>,
    callbacks: AppEngineCallbacks,
  ) {
    const { messages, systemMessage, providerSlug, modelSlug, providerKVs } =
      ctx

    const response = await tempAppEngineRunner({
      providerSlug,
      messages: [systemMessage, ...messages],
      model: modelSlug,
      providerKVs,
    })

    if (!response.body) {
      throw new Error('Response body is missing in AppEngineResponseStream')
    }

    return safeReadableStreamPipe(response.body, {
      onChunk: async (chunk) => {
        const value = new TextDecoder().decode(chunk)
        await Promise.resolve(callbacks.onToken(value.trim().slice(3, -1))) // slice(2) to remove the leading '0:"' and the trailing '"' from vercel AI
      },
      // TODO: This goes to the AppEngineRunner
      onError: async (error, partialResult) => {
        const value = partialResult.map((chunk) =>
          new TextDecoder().decode(chunk).trim().slice(3, -1),
        )
        await Promise.resolve(callbacks.onError(error, value.join('')))
      },
      // TODO: This goes to the AppEngineRunner
      onEnd: async (fullMessage) => {
        const value = fullMessage.map((chunk) =>
          new TextDecoder().decode(chunk).trim().slice(3, -1),
        )
        await Promise.resolve(callbacks.onEnd(value.join('')))
      },
    })
  }
}

interface TempAppEngineRunnerParams {
  providerSlug: string
  messages: AiRegistryMessage[]
  model: string
  providerKVs: Record<string, string>
}

const tempAppEngineRunner = async ({
  providerSlug,
  messages,
  model,
  providerKVs,
}: TempAppEngineRunnerParams) => {
  const provider = aiProvidersFetcherService.getProvider(providerSlug)

  if (!provider) {
    throw new Error(`Provider ${providerSlug} not found`)
  }

  //  TODO: Re-enable
  // await validateModelIsEnabledOrThrow(
  //   workspaceId,
  //   userId,
  //   appConfigVersion.model,
  // )

  const stream = await provider.executeAsStream(
    {
      provider: providerSlug,
      model,
      messages: messages,
      // TODO: Remove from executeAsStream; we'll handle it ourselves at a higher layer
      // onToken,
      // onFinal,
    },
    providerKVs,
  )

  const headers = {
    'Content-Type': 'text/event-stream',
  }
  // TODO: No longer need to wrap in StreamingTextResponse; return stream and handle at a higher
  // layer
  return new StreamingTextResponse(stream, { headers })
}
