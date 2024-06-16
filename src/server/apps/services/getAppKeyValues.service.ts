import type { UserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { PermissionsVerifier } from '@/server/permissions/PermissionsVerifier'
import {
  KeyValueType,
  type PrismaClientOrTrxClient,
} from '@/shared/globalTypes'
import { PermissionAction } from '@/shared/permissions/permissionDefinitions'
import type { KeyValue } from '@prisma/client'
import { scopeAppByWorkspace } from '../appUtils'

interface GetAppKeyValuesPayload {
  appId: string
}

export async function getAppKeyValuesService(
  prisma: PrismaClientOrTrxClient,
  uowContext: UserOnWorkspaceContext,
  payload: GetAppKeyValuesPayload,
) {
  const { userId, workspaceId } = uowContext
  const { appId } = payload

  await new PermissionsVerifier(prisma).passOrThrowTrpcError(
    PermissionAction.Use,
    userId,
    appId,
  )

  const kvs = await prisma.keyValue.findMany({
    where: {
      appId,
      app: scopeAppByWorkspace({}, workspaceId),
    },
  })

  return kvs.map(transformKeyValueEntityToParsedKeyValue)
}

export const transformKeyValueEntityToParsedKeyValue = (keyValue: KeyValue) => {
  if (keyValue.type === 'number') {
    return {
      ...keyValue,
      type: KeyValueType.Number,
      value: Number(keyValue.value),
    }
  }

  if (keyValue.type === KeyValueType.Boolean.toString()) {
    return {
      ...keyValue,
      type: KeyValueType.Boolean,
      value: keyValue.value === 'true',
    }
  }

  return {
    ...keyValue,
    type: KeyValueType.String,
    value: keyValue.value,
  }
}
