import type { RootRouter } from '@/server/trpc/rootRouter'
import type { inferRouterInputs } from '@trpc/server'

type RouterInput = inferRouterInputs<RootRouter>

export type AppCreateInput = RouterInput['apps']['create']

export type AppUpdateInput = RouterInput['apps']['update']
export type AppUpdateParams = Omit<AppUpdateInput, 'id'>

export interface ComponentWithAppId {
  appId: string
}

export enum AppEngineType {
  Default = 'default',
  Custom = 'custom',
}
