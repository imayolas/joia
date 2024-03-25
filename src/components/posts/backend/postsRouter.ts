import { createTRPCRouter } from '@/server/trpc/trpc'
import { postsConfigGetLatestForPostId } from './procedures/postsConfigGetLatestForPostId'
import { postsConfigUpdate } from './procedures/postsConfigUpdate'
import { postsCreate } from './procedures/postsCreate'
import { postsDelete } from './procedures/postsDelete'
import { postsGetById } from './procedures/postsGetById'
import { postsGetDefault } from './procedures/postsGetDefault'
import { postsGetLatest } from './procedures/postsGetLatest'
import { postsGetShares } from './procedures/postsGetShares'
import { postsSharePerform } from './procedures/postsSharePerform'
import { postsShareUpdateAccessLevel } from './procedures/postsShareUpdateAccessLevel'
import { postsUpdate } from './procedures/postsUpdate'
import { postsUpdateSharingScope } from './procedures/postsUpdateSharingScope'

export const postsRouter = createTRPCRouter({
  getDefault: postsGetDefault,
  getById: postsGetById,
  create: postsCreate,
  update: postsUpdate,
  delete: postsDelete,
  updateSharingScope: postsUpdateSharingScope,
  share: postsSharePerform,
  getShares: postsGetShares,
  updateShareAccessLevel: postsShareUpdateAccessLevel,
  updateConfig: postsConfigUpdate,
  getLatestConfig: postsConfigGetLatestForPostId,
  getLatestPost: postsGetLatest,
})
