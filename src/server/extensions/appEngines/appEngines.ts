import type { AbstractAppEngine } from '../../ai/lib/AbstractAppEngine'
import { OpenaiAssistantsEngine } from './OpenaiAssistantsEngine'
import { OpenaiBasicEngine } from './OpenaiBasicEngine'

export const enginesRegistry: AbstractAppEngine[] = [
  new OpenaiAssistantsEngine(),
  new OpenaiBasicEngine(),
]
