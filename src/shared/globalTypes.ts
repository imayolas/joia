import type { Prisma, PrismaClient } from '@prisma/client'
import type { DefaultArgs } from '@prisma/client/runtime/library'

export enum UserAccessLevel {
  Owner = 'owner',
  EditAndShare = 'edit_and_share',
  Use = 'use',
  View = 'view',
}

export enum UserAccessLevelActions {
  Owner = 'owner',
  EditAndShare = 'edit_and_share',
  Use = 'use',
  View = 'view',
  Remove = 'remove',
}

export enum ShareScope {
  Everybody = 'everybody',
  User = 'user',
}

export enum SidebarInfoCardType {
  Onboarding = 'onboarding',
}

export type Primitive = string | number | boolean | bigint | symbol

export type PrismaTrxClient = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export type PrismaClientOrTrxClient = PrismaClient | PrismaTrxClient
