import { aiProvidersFetcherService } from '@/server/ai/services/aiProvidersFetcher.service'
import createHttpError from 'http-errors'
import { z } from 'zod'
import {
  AbstractAppEngine,
  AppEngineUtils,
  type AppEngineParams,
} from './AbstractAppEngine'

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
    utils: AppEngineUtils,
  ) {
    const { messages, providerSlug, modelSlug, providerKVs } = ctx

    const provider = aiProvidersFetcherService.getProvider(providerSlug)

    if (!provider) {
      throw createHttpError(500, `Provider ${providerSlug} not found`)
    }

    // Remove callbacks from executeAsStream
    const result = await provider.executeAsStream(
      {
        provider: providerSlug,
        model: modelSlug,
        messages,
      },
      providerKVs,
    )

    for await (const chunk of result) {
      await utils.pushText(chunk)
    }
  }
}
