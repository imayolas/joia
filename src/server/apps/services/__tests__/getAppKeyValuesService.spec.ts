import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prisma } from '@/server/db'
import { PermissionsVerifier } from '@/server/permissions/PermissionsVerifier'
import { AppFactory } from '@/server/testing/factories/AppFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { KeyValueType } from '@/shared/globalTypes'
import { PermissionAction } from '@/shared/permissions/permissionDefinitions'
import type { App, KeyValue, User, Workspace } from '@prisma/client'
import { getAppKeyValuesService } from '../getAppKeyValues.service'

const subject = async (userId: string, workspaceId: string, appId: string) => {
  const context = await createUserOnWorkspaceContext(
    prisma,
    workspaceId,
    userId,
  )
  return await getAppKeyValuesService(prisma, context, { appId })
}

describe('getAppKeyValuesService', () => {
  let workspace: Workspace
  let user: User
  let app: App
  let kv1AsString: KeyValue
  let kv2AsNumber: KeyValue
  let kv3AsBoolean: KeyValue

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)

    user = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    app = await AppFactory.create(prisma, {
      userId: user.id,
      workspaceId: workspace.id,
    })

    kv1AsString = await prisma.keyValue.create({
      data: {
        key: 'key1',
        value: 'value1',
        appId: app.id,
        type: KeyValueType.String,
      },
    })

    kv2AsNumber = await prisma.keyValue.create({
      data: {
        key: 'key2',
        value: '2',
        appId: app.id,
        type: KeyValueType.Number,
      },
    })

    kv3AsBoolean = await prisma.keyValue.create({
      data: {
        key: 'key3',
        value: 'true',
        appId: app.id,
        type: KeyValueType.Boolean,
      },
    })
  })

  it('returns the kvs', async () => {
    const result = await subject(user.id, workspace.id, app.id)
    expect(result).toHaveLength(3)
    expect(result[0]!.value).toEqual(kv1AsString.value)
    expect(result[1]!.value).toEqual(Number(kv2AsNumber.value))
    expect(result[2]!.value).toEqual(Boolean(kv3AsBoolean.value))
  })

  it('calls PermissionsVerifier', async () => {
    const spy = jest.spyOn(
      PermissionsVerifier.prototype,
      'passOrThrowTrpcError',
    )

    await subject(user.id, workspace.id, app.id)

    expect(spy).toHaveBeenCalledWith(
      PermissionAction.Use,
      expect.anything(),
      expect.anything(),
    )
  })
})
