import type { AbstractAppEngine } from '../../ai/lib/AbstractAppEngine'
import { OpenaiAssistantsEngine } from './OpenaiAssistantsEngine'

export const enginesRegistry: AbstractAppEngine[] = [
  new OpenaiAssistantsEngine(),
]
