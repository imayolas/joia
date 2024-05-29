import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import { LlamaQOnServer } from '../lib/LlamaQOnServer'

const enqueueRouter = new Hono()
const llamaQ = new LlamaQOnServer('http://localhost:4000/nextjs')

const schema = z.object({
  queueName: z.string(),
  actionName: z.string(),
  payload: z.unknown(),
})

const validationFunc = validator('json', (value, c) => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    // Handle validation error
    return c.text('Invalid!', 401)
  }
  return parsed.data
})

enqueueRouter.post('/', validationFunc, async (c) => {
  const { queueName, actionName, payload } = c.req.valid('json')

  // Enqueue the job
  const queue = await llamaQ.enqueue(queueName, actionName, payload)

  // bullBoard.addQueue(new BullMQAdapter(queue))

  return c.json(
    {
      queueName,
      actionName,
      payload,
    },
    201,
  )
})

export { enqueueRouter }
