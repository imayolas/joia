import type { AiRegistryMessage } from '@/server/lib/ai-registry/aiRegistryTypes'
import type { App, Chat } from '@prisma/client'

type AllowedKVS = Record<string, string | number | boolean>

interface AppEngineRuntimeContext<T extends AllowedKVS> {
  readonly chat: Chat
  readonly app: App
  readonly kvs: T
}

export interface AppEngineParams<AppKVs extends AllowedKVS> {
  ctx: AppEngineRuntimeContext<AppKVs>
  messages: AiRegistryMessage[]
}

export abstract class AbstractAppEngine {
  abstract getName(): string
  abstract run(params: AppEngineParams): Promise<ReadableStream<unknown>>
}
