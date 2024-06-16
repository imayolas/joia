import type { Prisma, PrismaClient } from '@prisma/client'
import type { DefaultArgs } from '@prisma/client/runtime/library'

export enum UserAccessLevel {
  Owner = 'owner',
  Edit = 'edit',
  EditWithoutInvite = 'edit_without_invite',
  Invite = 'invite',
  Use = 'use',
}

export enum UserAccessLevelActions {
  Owner = UserAccessLevel.Owner,
  Edit = UserAccessLevel.Edit,
  EditWithoutInvite = UserAccessLevel.EditWithoutInvite,
  Invite = UserAccessLevel.Invite,
  Use = UserAccessLevel.Use,
  Remove = 'remove',
}

export enum ShareScope {
  Private = 'private',
  User = 'user',
  Everybody = 'everybody',
}

export enum SidebarInfoCardType {
  Onboarding = 'onboarding',
}

export enum KeyValueType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
}

export type PrismaTrxClient = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export type PrismaClientOrTrxClient = PrismaClient | PrismaTrxClient
