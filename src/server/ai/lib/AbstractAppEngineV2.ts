import type { AiRegistryMessage } from '@/server/lib/ai-registry/aiRegistryTypes'
import type { StreamingTextResponse } from 'ai'

type AllowedKVS = Record<string, string | number | boolean>

export interface AppEngineParamsV2<T extends AllowedKVS> {
  readonly providerKVs: Record<string, string>

  // readonly kvs: T
  readonly messages: AiRegistryMessage[]
  readonly modelSlug: string
  readonly providerSlug: string
}

export interface AppEngineCallbacksV2 {
  onToken: (chunk: string) => void | Promise<void>
  onEnd: (fullMessage: string) => void | Promise<void>
}

export abstract class AbstractAppEngineV2 {
  abstract getName(): string
  abstract run(
    params: AppEngineParamsV2<AllowedKVS>,
    callbacks: AppEngineCallbacksV2,
  ): Promise<StreamingTextResponse>
}
