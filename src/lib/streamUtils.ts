import { ensureError } from '@/lib/utils'
import { reject } from 'underscore'

interface SafeReadableStreamPipeCallbacks<T> {
  onChunk?: (chunk: T) => void | Promise<void>
  onError?: (error: Error) => void | Promise<void>
  onEnd?: () => void | Promise<void>
}

export const safeReadableStreamPipe = <T>(
  stream: ReadableStream<T>,
  callbacks?: SafeReadableStreamPipeCallbacks<T>,
) => {
  const reader = stream.getReader()

  return new ReadableStream<T>(
    {
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              controller.close()
              break
            }

            await Promise.resolve(callbacks?.onChunk?.(value))

            if (
              controller.desiredSize !== null &&
              controller.desiredSize <= 0
            ) {
              await new Promise<void>((resolve) => {
                let totalTime = 0
                const checkSize = () => {
                  if (totalTime > 10000) {
                    reject(new Error('desireTime check timeout (10s)'))
                  }
                  try {
                    if (controller.desiredSize && controller.desiredSize > 0) {
                      resolve()
                    } else {
                      totalTime += 10
                      setTimeout(checkSize, 10) // 60fps in the browser are 16ms. 10ms is fine.
                    }
                  } catch (error) {
                    reject(ensureError(error))
                  }
                }
                checkSize()
              })
            }

            controller.enqueue(value)
          }
        } catch (error) {
          const ensuredError = ensureError(error)
          await Promise.resolve(callbacks?.onError?.(ensuredError))
          controller.error(ensuredError)
        } finally {
          await Promise.resolve(callbacks?.onEnd?.())
          reader.releaseLock()
        }
      },
    },
    { highWaterMark: 2 }, // 1 or 2 is fine to keep the buffer minimal
  )
}
