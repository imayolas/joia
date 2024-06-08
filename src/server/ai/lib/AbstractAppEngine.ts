import type { AiRegistryMessage } from '@/server/lib/ai-registry/aiRegistryTypes'
import type { App, Chat } from '@prisma/client'

interface AppEngineRuntimeContext {
  readonly chat: Chat
  readonly app: App
}

export interface AppEngineParams {
  ctx: AppEngineRuntimeContext
  messages: AiRegistryMessage[]
}

export abstract class AbstractAppEngine {
  abstract getName(): string
  abstract run(params: AppEngineParams): Promise<ReadableStream<unknown>>
}
