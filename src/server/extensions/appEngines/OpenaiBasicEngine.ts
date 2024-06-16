import { env } from '@/env.mjs'
import {
  AbstractAppEngine,
  type AppEngineParams,
} from '@/server/ai/lib/AbstractAppEngine'

import { AppEngineResponseStream } from '@/server/ai/lib/AppEngineResponseStream'
import OpenAI from 'openai'

export class OpenaiBasicEngine extends AbstractAppEngine {
  getName() {
    return 'OpenaiBasicEngine'
  }

  async run({ ctx }: AppEngineParams) {
    const openai = new OpenAI({
      apiKey: env.INTERNAL_OPENAI_API_KEY,
    })
    await Promise.resolve()
    const stream = AppEngineResponseStream(
      {
        threadId: '123',
        messageId: '123',
      },
      async ({
        threadId,
        messageId,
        sendMessage,
        sendTextMessage,
        sendDataMessage,
        forwardStream,
      }) => {
        const aiResponse = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Say "yo yo yo soy Juaaaan"!' }],
          stream: true,
          max_tokens: 10,
        })

        for await (const message of aiResponse) {
          const text = message.choices[0]?.delta.content
          if (text) {
            sendTextMessage(text)
          }
        }
      },
    )

    return stream
  }
}
