import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prismaAsTrx } from '@/server/lib/prismaAsTrx'
import { PermissionsVerifier } from '@/server/permissions/PermissionsVerifier'
import {
  KeyValueType,
  type PrismaClientOrTrxClient,
  type PrismaTrxClient,
} from '@/shared/globalTypes'
import { PermissionAction } from '@/shared/permissions/permissionDefinitions'
import { Promise } from 'bluebird'
import { isBoolean, isNull, isNumber } from 'underscore'
import { scopeAppByWorkspace } from '../appUtils'

interface KeyValueEntry {
  key: string
  value: string | number | boolean | null
}

interface GetAppKeyValuesPayload {
  appId: string
  keyValues: KeyValueEntry[]
}

type KeyValueEntryWithoutTypeNull = Omit<KeyValueEntry, 'value'> & {
  value: string | number | boolean
}

export async function upsertAppKeyValuesService(
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload: GetAppKeyValuesPayload,
) {
  const { userId, workspaceId } = uowContext
  const { appId, keyValues: payloadKeyValues } = payload

  await new PermissionsVerifier(prisma).passOrThrowTrpcError(
    PermissionAction.Use,
    userId,
    appId,
  )

  return await prismaAsTrx(prisma, async (prisma) => {
    const kvs = await prisma.keyValue.findMany({
      where: {
        appId,
        app: scopeAppByWorkspace({}, workspaceId),
      },
    })
    const keysToInsert = payloadKeyValues.filter((payloadKV) => {
      return (
        !kvs.find((kv) => kv.key === payloadKV.key.toString()) &&
        !isNull(payloadKV.value)
      )
    }) as KeyValueEntryWithoutTypeNull[]

    const keysToUpdate = payloadKeyValues.filter(
      (payloadKV) =>
        kvs.find((kv) => kv.key === payloadKV.key.toString()) &&
        !isNull(payloadKV.value),
    ) as KeyValueEntryWithoutTypeNull[]

    const keysToDelete = payloadKeyValues.filter((payloadKV) =>
      isNull(payloadKV.value),
    )

    await insertKeyValues(prisma, appId, keysToInsert)
    await updateKeyValues(prisma, appId, keysToUpdate)
    await deleteKeyValues(prisma, appId, keysToDelete)
  })
}

const insertKeyValues = async (
  prisma: PrismaTrxClient,
  appId: string,
  keyValues: KeyValueEntryWithoutTypeNull[],
) => {
  return await prisma.keyValue.createMany({
    data: keyValues.map((kv) => {
      return {
        ...transformKeyValueEntryToKeyValueEntity(kv),
        appId,
      }
    }),
  })
}

const updateKeyValues = async (
  prisma: PrismaTrxClient,
  appId: string,
  keyValues: KeyValueEntryWithoutTypeNull[],
) => {
  return await Promise.map(keyValues, async (kv) => {
    return await prisma.keyValue.updateMany({
      where: {
        key: kv.key,
        appId,
      },
      data: transformKeyValueEntryToKeyValueEntity(kv),
    })
  })
}

const deleteKeyValues = async (
  prisma: PrismaTrxClient,
  appId: string,
  keyValues: KeyValueEntry[],
) => {
  return await Promise.map(keyValues, async (kv) => {
    return await prisma.keyValue.deleteMany({
      where: {
        key: kv.key,
        appId,
      },
    })
  })
}

const transformKeyValueEntryToKeyValueEntity = (
  keyValue: KeyValueEntryWithoutTypeNull,
) => {
  if (isNumber(keyValue.value)) {
    return {
      ...keyValue,
      value: keyValue.value.toString(),
      type: KeyValueType.Number,
    }
  }

  if (isBoolean(keyValue.value)) {
    return {
      ...keyValue,
      value: keyValue.value.toString(),
      type: KeyValueType.Boolean,
    }
  }

  return {
    ...keyValue,
    value: keyValue.value.toString(),
    type: KeyValueType.String,
  }
}
